import type { Database, QueryResult, RunResult } from 'node-sqlite3-wasm';
import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { closeConnection, createConnection } from '../transport/connection';
import { normalizeRow } from '../helpers/normalize';
import { detectQueryKind } from '../helpers/queryBuilder';
import { isDestructiveOperation } from '../helpers/security';
import type { BuiltQuery } from './types';
import { buildDeleteQuery } from './database/delete.operation';
import { buildExecuteQuery } from './database/executeQuery.operation';
import {
	buildInsertMultiRowQuery,
	buildInsertQuery,
	resolveInsertColumns,
} from './database/insert.operation';
import { buildSelectQuery } from './database/select.operation';
import { buildUpdateQuery } from './database/update.operation';
import { buildUpsertQuery } from './database/upsert.operation';

type ExecutionMode = 'independent' | 'transaction' | 'singleMultiRow';

/** Normalize a `lastInsertRowid` to a JSON-safe value (no blind `Number()`). */
function safeRowid(value: number | bigint): number | string {
	if (typeof value === 'bigint') {
		const asNumber = Number(value);
		return Number.isSafeInteger(asNumber) ? asNumber : String(value);
	}
	return Number.isSafeInteger(value) ? value : String(value);
}

interface QueryOutcome {
	kind: 'rows';
	rows: Record<string, unknown>[];
}

interface ChangeOutcome {
	kind: 'changes';
	changes: number;
	lastInsertRowid: number | string;
}

/** Execute one built statement, choosing `db.all` vs `db.run` by `expectRows`. */
function runStatement(db: Database, built: BuiltQuery, expectRows: boolean): QueryOutcome | ChangeOutcome {
	if (expectRows) {
		const rows = db.all(built.sql, built.values) as QueryResult[];
		return {
			kind: 'rows',
			rows: rows.map((r) => normalizeRow(r as Record<string, unknown>)),
		};
	}
	const info: RunResult = db.run(built.sql, built.values);
	return { kind: 'changes', changes: info.changes, lastInsertRowid: safeRowid(info.lastInsertRowid) };
}

function buildPerItemQuery(
	operation: string,
	ctx: IExecuteFunctions,
	itemIndex: number,
	insertColumns: string[],
): BuiltQuery {
	switch (operation) {
		case 'select':
			return buildSelectQuery(ctx, itemIndex);
		case 'insert':
			return buildInsertQuery(ctx, itemIndex, insertColumns);
		case 'update':
			return buildUpdateQuery(ctx, itemIndex);
		case 'delete':
			return buildDeleteQuery(ctx, itemIndex);
		case 'upsert':
			return buildUpsertQuery(ctx, itemIndex);
		case 'executeQuery':
			return buildExecuteQuery(ctx, itemIndex);
		default:
			throw new NodeOperationError(ctx.getNode(), `Unknown operation: ${operation}`);
	}
}

/** Whether a built statement should be read with `db.all` (rows) or `db.run`. */
function expectRowsFor(operation: string, built: BuiltQuery): boolean {
	if (operation === 'select') return true;
	if (operation === 'executeQuery') return detectQueryKind(built.sql) === 'rows';
	return false;
}

/**
 * Throw if `sql` is destructive (DROP / TRUNCATE / DELETE or UPDATE without
 * WHERE) and the caller has not set `confirmDestructive`. Thrown as a plain
 * Error so the per-item/singleMultiRow catch wraps it into a NodeOperationError
 * carrying the correct `itemIndex`. Independent of `readOnly`: it applies in
 * every mode so an accidental or AI-induced mass-impact write is blocked
 * before it reaches the engine.
 */
function guardDestructive(sql: string, confirmDestructive: boolean): void {
	if (confirmDestructive) {
		return;
	}
	if (isDestructiveOperation(sql)) {
		throw new Error(
			"This operation would affect the entire table / drop it. Set 'Confirm Destructive Operation' to proceed.",
		);
	}
}

/**
 * Engine for the SQLite node: open one connection, route each input item to its
 * operation builder, execute, and assemble output aligned with the input.
 *
 * Execution modes:
 * - `independent`: each item is its own statement; per-item continueOnFail;
 *   output aligned with the input (A4).
 * - `transaction`: all items inside BEGIN/COMMIT; results are buffered and only
 *   flushed after a successful COMMIT (A4: rolled-back rows are never reported
 *   as success). On any failure the transaction is rolled back globally.
 * - `singleMultiRow`: only insert; one multi-row INSERT for all items.
 *
 * Security (independent, always applied):
 * - `readOnly`: when true, the connection is opened read-only at the engine
 *   level (node-sqlite3-wasm rejects every write). Strong guarantee for AI-agent
 *   exposure. See `createConnection(path, { readOnly })`.
 * - `confirmDestructive`: when false, statements flagged by
 *   `isDestructiveOperation` (DROP / TRUNCATE / DELETE or UPDATE without WHERE)
 *   throw before execution, so an accidental or AI-induced mass-impact write
 *   cannot run unless a human ticks the flag.
 */
export async function routeSqlite(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
	const items = this.getInputData();
	if (items.length === 0) {
		// No input items -> no SQL to run; avoid malformed empty statements.
		return [[]];
	}

	const creds = await this.getCredentials<{ databasePath?: string }>('sqliteApi');
	const databasePath = creds.databasePath;
	if (typeof databasePath !== 'string' || databasePath.length === 0) {
		throw new NodeOperationError(this.getNode(), 'SQLite credential is missing a databasePath');
	}

	const mode = this.getNodeParameter('executionMode', 0, 'independent') as ExecutionMode;
	const operation = this.getNodeParameter('operation', 0) as string;
	const readOnly = this.getNodeParameter('readOnly', 0, false) as boolean;
	const confirmDestructive = this.getNodeParameter('confirmDestructive', 0, false) as boolean;
	const continueOnFail = this.continueOnFail();

	const returnData: INodeExecutionData[] = [];

	let db: Database;
	try {
		db = createConnection(databasePath, { readOnly });
	} catch (error) {
		throw new NodeOperationError(this.getNode(), error as Error, {
			message: 'Failed to open the SQLite database',
		});
	}

	try {
		// --- single multi-row INSERT: one statement for all items ---
		if (operation === 'insert' && mode === 'singleMultiRow') {
			try {
				const insertColumns = resolveInsertColumns(this, 0, items);
				const built = buildInsertMultiRowQuery(this, items, insertColumns);
				guardDestructive(built.sql, confirmDestructive);
				const info: RunResult = db.run(built.sql, built.values);
				returnData.push({
					json: { changes: info.changes, lastInsertRowid: safeRowid(info.lastInsertRowid) },
					pairedItem: { item: 0 },
				});
			} catch (error) {
				if (continueOnFail) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: 0 },
					});
				} else {
					throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: 0 });
				}
			}
			return [returnData];
		}

		// --- per-item path (independent + transaction) ---
		const insertColumns = operation === 'insert' ? resolveInsertColumns(this, 0, items) : [];
		const inTransaction = mode === 'transaction';
		const buffer: INodeExecutionData[] = [];

		if (inTransaction) {
			db.exec('BEGIN');
		}

		for (let i = 0; i < items.length; i++) {
			try {
				const built = buildPerItemQuery(operation, this, i, insertColumns);
				guardDestructive(built.sql, confirmDestructive);
				const outcome = runStatement(db, built, expectRowsFor(operation, built));
				if (outcome.kind === 'rows') {
					for (const row of outcome.rows) {
						buffer.push({ json: row as unknown as IDataObject, pairedItem: { item: i } });
					}
				} else {
					buffer.push({
						json: { changes: outcome.changes, lastInsertRowid: outcome.lastInsertRowid },
						pairedItem: { item: i },
					});
				}
			} catch (error) {
				if (inTransaction) {
					// Global rollback: do not report buffered (now-rolled-back) rows.
					try {
						db.exec('ROLLBACK');
					} catch {
						// best-effort rollback; the original error is the one to surface
					}
					if (continueOnFail) {
						returnData.push({
							json: { error: (error as Error).message },
							pairedItem: { item: i },
						});
						return [returnData];
					}
					throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
				}
				if (continueOnFail) {
					// Per-item: emit an error for this item and keep going (A4).
					buffer.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		if (inTransaction) {
			try {
				db.exec('COMMIT');
			} catch (error) {
				try {
					db.exec('ROLLBACK');
				} catch {
					// best-effort
				}
				throw new NodeOperationError(this.getNode(), error as Error, {
					message: 'Transaction COMMIT failed',
				});
			}
			// Flush only after a successful COMMIT (A4).
			for (const item of buffer) {
				returnData.push(item);
			}
		} else {
			for (const item of buffer) {
				returnData.push(item);
			}
		}
	} finally {
		closeConnection(db);
	}

	return [returnData];
}