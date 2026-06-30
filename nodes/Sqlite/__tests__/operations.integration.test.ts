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

/**
 * End-to-end integration tests for the SQLite operations layer.
 *
 * The n8n execution context is mocked (the node parameter surface); the SQLite
 * engine is REAL (node-sqlite3-wasm on a temp file). This exercises the router
 * + every operation builder against a live database, including the A1-A6 fixes.
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

const TABLE = { mode: 'name', value: 'users' };
const KV = { mode: 'name', value: 'kv' };
const H = { mode: 'name', value: 'h' };

describe('Sqlite operations integration', () => {
	let dbPath: string;

	beforeEach(() => {
		dbPath = path.join(os.tmpdir(), `n8n-sqlite-ops-${Date.now()}-${process.pid}.sqlite`);
		const db = createConnection(dbPath);
		db.exec(
			'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER, active INTEGER, big INTEGER)',
		);
		db.exec('CREATE TABLE kv (k TEXT UNIQUE, v TEXT)');
		db.exec('CREATE TABLE h (a INTEGER, b INTEGER, c INTEGER)');
		closeConnection(db);
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

	it('insert + select round-trip normalizes boolean to 1 (A1)', async () => {
		await run({
			dbPath,
			items: [J({ id: 1, name: 'alice', age: 30, active: true, big: 0 })],
			params: {
				operation: 'insert',
				executionMode: 'independent',
				table: TABLE,
				columns: ['id', 'name', 'age', 'active', 'big'],
			},
		});

		const rows = await run({
			dbPath,
			items: [J({})],
			params: { operation: 'select', executionMode: 'independent', table: TABLE, outputColumns: [] },
		});
		expect(rows).toHaveLength(1);
		const row = rows[0].json as Record<string, unknown>;
		expect(row.name).toBe('alice');
		expect(row.active).toBe(1); // A1: true -> 1
		expect(row.age).toBe(30);
	});

	it('insert multi-row aligns heterogeneous rows to the union with nulls (A2/A3)', async () => {
		await run({
			dbPath,
			items: [J({ a: 1, b: 2 }), J({ a: 3 }), J({ b: 4, c: 5 })],
			params: {
				operation: 'insert',
				executionMode: 'singleMultiRow',
				table: H,
				columns: [], // -> unionColumns: a, b, c
			},
		});

		const rows = await run({
			dbPath,
			items: [J({})],
			params: {
				operation: 'select',
				executionMode: 'independent',
				table: H,
				outputColumns: ['a', 'b', 'c'],
			},
		});
		// Aligned to columns a,b,c; missing -> null; insertion (rowid) order (A2/A3).
		expect(rows.map((r) => r.json as Record<string, unknown>)).toEqual([
			{ a: 1, b: 2, c: null },
			{ a: 3, b: null, c: null },
			{ a: null, b: 4, c: 5 },
		]);
	});

	it('upsert does nothing when only the match column is present (A5)', async () => {
		await run({
			dbPath,
			items: [J({ k: 'a', v: 'x' })],
			params: {
				operation: 'insert',
				executionMode: 'independent',
				table: KV,
				columns: ['k', 'v'],
			},
		});

		// Upsert with only the match column -> ON CONFLICT DO NOTHING, no error.
		const res = await run({
			dbPath,
			items: [J({ k: 'a' })],
			params: {
				operation: 'upsert',
				executionMode: 'independent',
				table: KV,
				matchColumns: ['k'],
				columns: ['k'],
			},
		});
		expect((res[0].json as Record<string, unknown>).changes).toBe(0);

		const rows = await run({
			dbPath,
			items: [J({})],
			params: { operation: 'select', executionMode: 'independent', table: KV, outputColumns: [] },
		});
		expect((rows[0].json as Record<string, unknown>).v).toBe('x'); // unchanged
	});

	it('upsert updates on conflict (DO UPDATE SET)', async () => {
		await run({
			dbPath,
			items: [J({ k: 'a', v: 'x' })],
			params: { operation: 'insert', executionMode: 'independent', table: KV, columns: ['k', 'v'] },
		});

		await run({
			dbPath,
			items: [J({ k: 'a', v: 'new' })],
			params: {
				operation: 'upsert',
				executionMode: 'independent',
				table: KV,
				matchColumns: ['k'],
				columns: [], // all keys: k, v -> update v
			},
		});

		const rows = await run({
			dbPath,
			items: [J({})],
			params: { operation: 'select', executionMode: 'independent', table: KV, outputColumns: [] },
		});
		expect((rows[0].json as Record<string, unknown>).v).toBe('new');
	});

	it('update sets columns matched by match column', async () => {
		await run({
			dbPath,
			items: [J({ id: 1, name: 'a', age: 30, active: 0, big: 0 })],
			params: {
				operation: 'insert',
				executionMode: 'independent',
				table: TABLE,
				columns: ['id', 'name', 'age', 'active', 'big'],
			},
		});

		await run({
			dbPath,
			items: [J({ id: 1, name: 'b', age: 31 })],
			params: {
				operation: 'update',
				executionMode: 'independent',
				table: TABLE,
				matchColumns: ['id'],
				updateColumns: [], // SET name, age (all keys minus match)
			},
		});

		const rows = await run({
			dbPath,
			items: [J({})],
			params: { operation: 'select', executionMode: 'independent', table: TABLE, outputColumns: [] },
		});
		const row = rows[0].json as Record<string, unknown>;
		expect(row.name).toBe('b');
		expect(row.age).toBe(31);
	});

	it('delete removes rows matched by match column', async () => {
		await run({
			dbPath,
			items: [
				J({ id: 1, name: 'a', age: 1, active: 0, big: 0 }),
				J({ id: 2, name: 'b', age: 2, active: 0, big: 0 }),
			],
			params: {
				operation: 'insert',
				executionMode: 'singleMultiRow',
				table: TABLE,
				columns: ['id', 'name', 'age', 'active', 'big'],
			},
		});

		await run({
			dbPath,
			items: [J({ id: 1 })],
			params: {
				operation: 'delete',
				executionMode: 'independent',
				table: TABLE,
				matchColumns: ['id'],
			},
		});

		const rows = await run({
			dbPath,
			items: [J({})],
			params: { operation: 'select', executionMode: 'independent', table: TABLE, outputColumns: [] },
		});
		expect(rows).toHaveLength(1);
		expect((rows[0].json as Record<string, unknown>).id).toBe(2);
	});

	it('executeQuery binds replacements ($N -> ?) for SELECT and changes (A6)', async () => {
		await run({
			dbPath,
			items: [J({ id: 1, name: 'a', age: 40, active: 1, big: 0 })],
			params: {
				operation: 'insert',
				executionMode: 'independent',
				table: TABLE,
				columns: ['id', 'name', 'age', 'active', 'big'],
			},
		});

		const rows = await run({
			dbPath,
			items: [J({})],
			params: {
				operation: 'executeQuery',
				executionMode: 'independent',
				query: 'SELECT * FROM users WHERE age > $1',
				replacementsJson: '[20]',
			},
		});
		expect(rows).toHaveLength(1);
		expect((rows[0].json as Record<string, unknown>).name).toBe('a');

		const changes = await run({
			dbPath,
			items: [J({})],
			params: {
				operation: 'executeQuery',
				executionMode: 'independent',
				query: 'UPDATE users SET name = $1 WHERE id = $2',
				replacementsJson: '["z", 1]',
			},
		});
		expect((changes[0].json as Record<string, unknown>).changes).toBe(1);
	});

	it('executeQuery detects PRAGMA as a row-returning query', async () => {
		const rows = await run({
			dbPath,
			items: [J({})],
			params: {
				operation: 'executeQuery',
				executionMode: 'independent',
				query: 'PRAGMA table_info("users")',
				replacementsJson: '[]',
			},
		});
		expect(rows.length).toBeGreaterThan(0);
		expect((rows[0].json as Record<string, unknown>).name).toBe('id');
	});

	it('bigint in SELECT is normalized to a JSON-safe string', async () => {
		const huge = BigInt(Number.MAX_SAFE_INTEGER) + 2n;
		await run({
			dbPath,
			items: [J({ id: 2, name: 'big', age: 0, active: 0, big: huge })],
			params: {
				operation: 'insert',
				executionMode: 'independent',
				table: TABLE,
				columns: ['id', 'name', 'age', 'active', 'big'],
			},
		});

		const rows = await run({
			dbPath,
			items: [J({})],
			params: { operation: 'select', executionMode: 'independent', table: TABLE, outputColumns: [] },
		});
		const row = rows[0].json as Record<string, unknown>;
		expect(typeof row.big).toBe('string');
		expect(row.big).toBe(String(huge));
		// JSON-serializable (the whole point of normalizeRow).
		expect(() => JSON.stringify(rows)).not.toThrow();
	});

	it('WHERE > with an empty value throws (no Number("")===0)', async () => {
		const baseParams = {
			operation: 'select',
			executionMode: 'independent',
			table: TABLE,
			outputColumns: [],
			whereConditions: { condition: [{ column: 'age', operator: '>', value: '' }] },
		} as Record<string, unknown>;

		await expect(
			run({ dbPath, items: [J({})], params: { ...baseParams } }),
		).rejects.toThrow(/Empty value not allowed/);

		// With continueOnFail the error is emitted per item instead of thrown.
		const rows = await run({
			dbPath,
			items: [J({})],
			params: { ...baseParams },
			continueOnFail: true,
		});
		expect(rows).toHaveLength(1);
		expect((rows[0].json as Record<string, unknown>).error).toMatch(/Empty value not allowed/);
	});

	it('select with empty outputColumns returns all columns (*)', async () => {
		await run({
			dbPath,
			items: [J({ id: 1, name: 'a', age: 1, active: 0, big: 0 })],
			params: {
				operation: 'insert',
				executionMode: 'independent',
				table: TABLE,
				columns: ['id', 'name', 'age', 'active', 'big'],
			},
		});

		const rows = await run({
			dbPath,
			items: [J({})],
			params: {
				operation: 'select',
				executionMode: 'independent',
				table: TABLE,
				outputColumns: [],
				limit: 1,
			},
		});
		expect(Object.keys(rows[0].json as Record<string, unknown>).sort()).toEqual(
			['active', 'age', 'big', 'id', 'name'],
		);
	});

	it('continueOnFail with a bad query in the middle keeps output aligned (A4)', async () => {
		const rows = await run({
			dbPath,
			items: [J({}), J({}), J({})],
			params: {
				operation: 'executeQuery',
				executionMode: 'independent',
				query: (i: number) => ['SELECT 1 AS ok', 'BAD SQL HERE', 'SELECT 2 AS ok'][i],
				replacementsJson: '[]',
			},
			continueOnFail: true,
		});
		expect(rows).toHaveLength(3);
		expect((rows[0].json as Record<string, unknown>).ok).toBe(1);
		expect((rows[1].json as Record<string, unknown>).error).toBeTruthy();
		expect((rows[2].json as Record<string, unknown>).ok).toBe(2);
		expect(rows.map((r) => r.pairedItem)).toEqual([
			{ item: 0 },
			{ item: 1 },
			{ item: 2 },
		]);
	});

	it('transaction mode commits all items on success', async () => {
		await run({
			dbPath,
			items: [
				J({ id: 10, name: 't1', age: 1, active: 0, big: 0 }),
				J({ id: 11, name: 't2', age: 2, active: 0, big: 0 }),
			],
			params: {
				operation: 'insert',
				executionMode: 'transaction',
				table: TABLE,
				columns: ['id', 'name', 'age', 'active', 'big'],
			},
		});

		const rows = await run({
			dbPath,
			items: [J({})],
			params: { operation: 'select', executionMode: 'independent', table: TABLE, outputColumns: [] },
		});
		expect(rows).toHaveLength(2);
	});

	it('transaction mode rolls back on failure and reports no partial success', async () => {
		// First item valid, second item fails; transaction -> global rollback.
		await expect(
			run({
				dbPath,
				items: [J({}), J({})],
				params: {
					operation: 'executeQuery',
					executionMode: 'transaction',
					query: (i: number) =>
						[
							'INSERT INTO users (id, name, age, active, big) VALUES (20, "x", 0, 0, 0)',
							'INSERT INTO nonexistent VALUES (1)',
						][i],
					replacementsJson: '[]',
				},
			}),
		).rejects.toThrow();

		const rows = await run({
			dbPath,
			items: [J({})],
			params: { operation: 'select', executionMode: 'independent', table: TABLE, outputColumns: [] },
		});
		expect(rows).toHaveLength(0); // rolled back: id 20 never persisted

		// With continueOnFail the rolled-back transaction emits only the error.
		const out = await run({
			dbPath,
			items: [J({}), J({})],
			params: {
				operation: 'executeQuery',
				executionMode: 'transaction',
				query: (i: number) =>
					[
						'INSERT INTO users (id, name, age, active, big) VALUES (21, "x", 0, 0, 0)',
						'INSERT INTO nonexistent VALUES (1)',
					][i],
				replacementsJson: '[]',
			},
			continueOnFail: true,
		});
		expect(out).toHaveLength(1);
		expect((out[0].json as Record<string, unknown>).error).toBeTruthy();
		// id 21 was rolled back, not reported as success.
		const after = await run({
			dbPath,
			items: [J({})],
			params: { operation: 'select', executionMode: 'independent', table: TABLE, outputColumns: [] },
		});
		expect(after).toHaveLength(0);
	});

	it('empty items returns no output without running SQL', async () => {
		const rows = await run({
			dbPath,
			items: [],
			params: {
				operation: 'insert',
				executionMode: 'independent',
				table: TABLE,
				columns: ['id', 'name'],
			},
		});
		expect(rows).toEqual([]);
	});

	it('lastInsertRowid is a safe number for small ids', async () => {
		const res = await run({
			dbPath,
			items: [J({ name: 'n', age: 1, active: 0, big: 0 })],
			params: {
				operation: 'insert',
				executionMode: 'independent',
				table: TABLE,
				columns: ['name', 'age', 'active', 'big'],
			},
		});
		const id = (res[0].json as Record<string, unknown>).lastInsertRowid;
		expect(typeof id).toBe('number');
		expect(id).toBe(1);
	});
});