import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type {
	IDataObject,
	IExecuteFunctions,
	INode,
	INodeExecutionData,
} from 'n8n-workflow';

import { closeConnection, createConnection } from '../transport/connection';
import { routeSqlite } from '../actions/router';
import { Sqlite } from '../Sqlite.node';

/**
 * Integration tests for the AI-agent security safeguards:
 *  - `readOnly` (engine-level write rejection)
 *  - `confirmDestructive` (destructive-operation guard)
 *  - `usableAsTool: true` on the node description
 *
 * The n8n execution context is mocked; the SQLite engine is REAL
 * (node-sqlite3-wasm on a temp file).
 */

function J(obj: Record<string, unknown>): INodeExecutionData {
	return { json: obj as unknown as IDataObject };
}

interface CtxOptions {
	dbPath: string;
	items: INodeExecutionData[];
	params: Record<string, unknown>;
	continueOnFail?: boolean;
}

function makeCtx(opts: CtxOptions): IExecuteFunctions {
	const { dbPath, items, params, continueOnFail = false } = opts;
	const node = {
		id: '1',
		name: 'sqlite',
		type: 'n8n-nodes-sqlite3-wasm.nodes.sqlite',
		typeVersion: 1,
		position: [0, 0] as [number, number],
		parameters: {},
	} as unknown as INode;

	return {
		getInputData: () => items,
		getCredentials: async () => ({ databasePath: dbPath }) as unknown as IDataObject,
		getNodeParameter: (name: string, itemIndex: number, fallback?: unknown) => {
			const v = params[name];
			if (typeof v === 'function') {
				return (v as (i: number) => unknown)(itemIndex);
			}
			return v !== undefined ? v : fallback;
		},
		continueOnFail: () => continueOnFail,
		getNode: () => node,
	} as unknown as IExecuteFunctions;
}

async function run(opts: CtxOptions): Promise<INodeExecutionData[]> {
	return (await routeSqlite.call(makeCtx(opts)))[0];
}

/** Seed the DB with a writable connection (independent of the node). */
function seed(dbPath: string, ...execs: string[]): void {
	const db = createConnection(dbPath);
	for (const stmt of execs) {
		db.exec(stmt);
	}
	closeConnection(db);
}

/**
 * Count rows in `users` by running a SELECT through the node's own connection
 * lifecycle. Verifying via the node (instead of a separate readOnly connection)
 * avoids a node-sqlite3-wasm quirk where an external readOnly connection's
 * SHARED lock is not released in time for the next writer ("database is locked").
 */
async function countUsers(dbPath: string): Promise<number> {
	const rows = await run({
		dbPath,
		items: [J({})],
		params: {
			operation: 'select',
			executionMode: 'independent',
			table: TABLE,
			outputColumns: [],
		},
	});
	return rows.length;
}

/** True when `table` exists in sqlite_master, queried via the node. */
async function tableExistsViaNode(dbPath: string, table: string): Promise<boolean> {
	const rows = await run({
		dbPath,
		items: [J({})],
		params: {
			operation: 'executeQuery',
			executionMode: 'independent',
			query: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = $1",
			replacementsJson: JSON.stringify([table]),
		},
	});
	return rows.length > 0;
}

const TABLE = { mode: 'name', value: 'users' };

const SCHEMA = [
	'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)',
	'CREATE TABLE droppable (id INTEGER PRIMARY KEY)',
];

describe('Sqlite security safeguards', () => {
	let dbPath: string;

	beforeEach(() => {
		dbPath = path.join(os.tmpdir(), `n8n-sqlite-sec-${Date.now()}-${process.pid}.sqlite`);
		seed(dbPath, ...SCHEMA);
	});

	afterEach(() => {
		for (const ext of ['', '-journal', '-wal', '-shm']) {
			try {
				fs.unlinkSync(`${dbPath}${ext}`);
			} catch {
				// best-effort
			}
		}
	});

	describe('readOnly (engine-level write rejection)', () => {
		it('a) SELECT works and INSERT / DELETE are rejected by the engine', async () => {
			seed(dbPath, "INSERT INTO users (id, name, age) VALUES (1, 'alice', 30)");

			// SELECT works in read-only mode.
			const rows = await run({
				dbPath,
				items: [J({})],
				params: {
					operation: 'select',
					executionMode: 'independent',
					table: TABLE,
					outputColumns: [],
					readOnly: true,
				},
			});
			expect(rows).toHaveLength(1);
			expect((rows[0].json as Record<string, unknown>).name).toBe('alice');

			// INSERT is rejected by the engine (read-only).
			await expect(
				run({
					dbPath,
					items: [J({ id: 2, name: 'bob', age: 1 })],
					params: {
						operation: 'insert',
						executionMode: 'independent',
						table: TABLE,
						columns: ['id', 'name', 'age'],
						readOnly: true,
					},
				}),
			).rejects.toThrow(/readonly/);

			// Structured DELETE (has WHERE) is rejected by the engine (read-only),
			// not by the destructive guard.
			await expect(
				run({
					dbPath,
					items: [J({ id: 1 })],
					params: {
						operation: 'delete',
						executionMode: 'independent',
						table: TABLE,
						matchColumns: ['id'],
						readOnly: true,
					},
				}),
			).rejects.toThrow(/readonly/);

			// Nothing was written: the seeded row survives.
			expect(await countUsers(dbPath)).toBe(1);
		});
	});

	describe('confirmDestructive (destructive-operation guard)', () => {
		beforeEach(() => {
			seed(
				dbPath,
				"INSERT INTO users (id, name, age) VALUES (1, 'a', 1)",
				"INSERT INTO users (id, name, age) VALUES (2, 'b', 2)",
			);
		});

		it('b) DELETE without WHERE is blocked without confirm, runs with confirm', async () => {
			const q = 'DELETE FROM users';
			await expect(
				run({
					dbPath,
					items: [J({})],
					params: {
						operation: 'executeQuery',
						executionMode: 'independent',
						query: q,
						replacementsJson: '[]',
						confirmDestructive: false,
					},
				}),
			).rejects.toThrow(/Confirm Destructive Operation/);

			// Blocked before execution: rows untouched.
			expect(await countUsers(dbPath)).toBe(2);

			const res = await run({
				dbPath,
				items: [J({})],
				params: {
					operation: 'executeQuery',
					executionMode: 'independent',
					query: q,
					replacementsJson: '[]',
					confirmDestructive: true,
				},
			});
			expect((res[0].json as Record<string, unknown>).changes).toBe(2);
			expect(await countUsers(dbPath)).toBe(0);
		});

		it('c) DROP is blocked without confirm, runs with confirm', async () => {
			await expect(
				run({
					dbPath,
					items: [J({})],
					params: {
						operation: 'executeQuery',
						executionMode: 'independent',
						query: 'DROP TABLE droppable',
						replacementsJson: '[]',
						confirmDestructive: false,
					},
				}),
			).rejects.toThrow(/Confirm Destructive Operation/);
			expect(await tableExistsViaNode(dbPath, 'droppable')).toBe(true);

			await run({
				dbPath,
				items: [J({})],
				params: {
					operation: 'executeQuery',
					executionMode: 'independent',
					query: 'DROP TABLE droppable',
					replacementsJson: '[]',
					confirmDestructive: true,
				},
			});
			expect(await tableExistsViaNode(dbPath, 'droppable')).toBe(false);
		});

		it('c-bis) TRUNCATE is detected as destructive (SQLite has no TRUNCATE; with confirm the guard steps aside and the engine rejects the syntax)', async () => {
			// Without confirm: the guard blocks it (never reaches the engine).
			await expect(
				run({
					dbPath,
					items: [J({})],
					params: {
						operation: 'executeQuery',
						executionMode: 'independent',
						query: 'TRUNCATE TABLE users',
						replacementsJson: '[]',
						confirmDestructive: false,
					},
				}),
			).rejects.toThrow(/Confirm Destructive Operation/);

			// With confirm: the guard steps aside (it is NOT the guard that throws);
			// SQLite then rejects TRUNCATE as unsupported syntax.
			await expect(
				run({
					dbPath,
					items: [J({})],
					params: {
						operation: 'executeQuery',
						executionMode: 'independent',
						query: 'TRUNCATE TABLE users',
						replacementsJson: '[]',
						confirmDestructive: true,
					},
				}),
			).rejects.toThrow(/syntax|TRUNCATE|near/);
		});

		it('d) UPDATE without WHERE is blocked without confirm, runs with confirm', async () => {
			const q = "UPDATE users SET name = 'x'";
			await expect(
				run({
					dbPath,
					items: [J({})],
					params: {
						operation: 'executeQuery',
						executionMode: 'independent',
						query: q,
						replacementsJson: '[]',
						confirmDestructive: false,
					},
				}),
			).rejects.toThrow(/Confirm Destructive Operation/);
			expect(await countUsers(dbPath)).toBe(2);

			const res = await run({
				dbPath,
				items: [J({})],
				params: {
					operation: 'executeQuery',
					executionMode: 'independent',
					query: q,
					replacementsJson: '[]',
					confirmDestructive: true,
				},
			});
			expect((res[0].json as Record<string, unknown>).changes).toBe(2);
		});

		it('e) DELETE WITH WHERE runs without confirm (scoped, not destructive)', async () => {
			const res = await run({
				dbPath,
				items: [J({})],
				params: {
					operation: 'executeQuery',
					executionMode: 'independent',
					query: 'DELETE FROM users WHERE id = $1',
					replacementsJson: '[1]',
					confirmDestructive: false,
				},
			});
			expect((res[0].json as Record<string, unknown>).changes).toBe(1);
			expect(await countUsers(dbPath)).toBe(1);
		});
	});

	describe('usableAsTool', () => {
		it('f) the node description exposes usableAsTool: true', () => {
			const description = new Sqlite().description;
			expect(description.usableAsTool).toBe(true);
		});
	});
});