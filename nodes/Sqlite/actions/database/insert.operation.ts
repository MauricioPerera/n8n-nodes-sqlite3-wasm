import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

import { escapeSqlIdentifier, normalizeBindValue } from '../../helpers/normalize';
import { alignRowsToColumns, unionColumns, type BindValue } from '../../helpers/queryBuilder';
import { type BuiltQuery, readStringArray, resolveTable } from '../types';

/**
 * Resolve the column list for an insert across all items.
 *
 * If the user supplies an explicit `columns` list, every row is aligned to it
 * (A3: column<->value order guaranteed). If empty, the first-seen union of the
 * items' keys is used (A2: heterogeneous rows still align, missing -> null).
 */
export function resolveInsertColumns(
	ctx: IExecuteFunctions,
	itemIndex: number,
	items: INodeExecutionData[],
): string[] {
	const explicit = readStringArray(ctx, 'columns', itemIndex);
	if (explicit.length > 0) {
		return explicit;
	}
	return unionColumns(items.map((i) => i.json as Record<string, unknown>));
}

/**
 * Build a single-row INSERT for one item, aligned to `columns` via
 * `alignRowsToColumns` (A2: missing -> null, A3: column order). Values are
 * normalized through `normalizeBindValue` (A1).
 */
export function buildInsertQuery(
	ctx: IExecuteFunctions,
	itemIndex: number,
	columns: string[],
): BuiltQuery {
	if (columns.length === 0) {
		throw new Error('Insert requires at least one column (select Columns or supply items with fields)');
	}
	const table = resolveTable(ctx, itemIndex);
	const row = ctx.getInputData()[itemIndex].json as Record<string, unknown>;

	const rawValues = alignRowsToColumns([row], columns)[0];
	const values: BindValue[] = rawValues.map((v) => normalizeBindValue(v));

	const colList = columns.map((c) => escapeSqlIdentifier(c)).join(', ');
	const placeholders = columns.map(() => '?').join(', ');
	const sql = `INSERT INTO ${escapeSqlIdentifier(table)} (${colList}) VALUES (${placeholders})`;
	return { sql, values };
}

/**
 * Build a single multi-row INSERT (the `singleMultiRow` execution mode) from
 * all items at once, aligned to `columns` via `alignRowsToColumns` (A2/A3).
 * Every value is normalized through `normalizeBindValue` (A1).
 */
export function buildInsertMultiRowQuery(
	ctx: IExecuteFunctions,
	items: INodeExecutionData[],
	columns: string[],
): BuiltQuery {
	if (columns.length === 0) {
		throw new Error('Insert requires at least one column');
	}
	const table = resolveTable(ctx, 0);
	const rows = items.map((i) => i.json as Record<string, unknown>);

	const aligned = alignRowsToColumns(rows, columns);
	const values: BindValue[] = [];
	for (const rowValues of aligned) {
		for (const v of rowValues) {
			values.push(normalizeBindValue(v));
		}
	}

	const colList = columns.map((c) => escapeSqlIdentifier(c)).join(', ');
	const rowPlaceholders = `(${columns.map(() => '?').join(', ')})`;
	const allPlaceholders = aligned.map(() => rowPlaceholders).join(', ');
	const sql = `INSERT INTO ${escapeSqlIdentifier(table)} (${colList}) VALUES ${allPlaceholders}`;
	return { sql, values };
}