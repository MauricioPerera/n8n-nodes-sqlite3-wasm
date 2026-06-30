import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type {
	IDataObject,
	IExecuteFunctions,
	INode,
	INodeExecutionData,
} from 'n8n-workflow';

import { routeSqlite } from '../actions/router';

/**
 * Integration tests for the v1.1.0 multi-database selection model.
 *
 * The n8n execution context is mocked (the node parameter surface, including
 * the new `database` / `databasePathOverride` fields and the credential's
 * `baseDirectory`); the SQLite engine is REAL (node-sqlite3-wasm on temp files
 * and temp directories). Covers the definition-of-done cases a-d.
 *
 * Per the readOnly-lock lesson, all state verification goes through the node's
 * own execution cycle (`run()` with select), never via an external readOnly
 * connection between runs.
 */

function J(obj: Record<string, unknown>): INodeExecutionData {
	return { json: obj as unknown as IDataObject };
}

interface Cred {
	databasePath?: string;
	baseDirectory?: string;
}

interface CtxOptions {
	cred: Cred;
	items: INodeExecutionData[];
	params: Record<string, unknown>;
	continueOnFail?: boolean;
}

function makeCtx(opts: CtxOptions): IExecuteFunctions {
	const { cred, items, params, continueOnFail = false } = opts;
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
		getCredentials: async () => ({ ...cred }) as unknown as IDataObject,
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

const TABLE = { mode: 'name', value: 't' };

/** Recursively remove a directory tree (best-effort). */
function rmrf(dir: string): void {
	try {
		fs.rmSync(dir, { recursive: true, force: true });
	} catch {
		// best-effort
	}
}

/** Remove a database file plus its sidecar files (best-effort). */
function rmDb(filePath: string): void {
	for (const ext of ['', '-journal', '-wal', '-shm']) {
		try {
			fs.unlinkSync(`${filePath}${ext}`);
		} catch {
			// best-effort
		}
	}
}

/** Create table `t` in the database selected by `params` (executed via the node). */
async function createTable(cred: Cred, params: Record<string, unknown>): Promise<void> {
	await run({
		cred,
		items: [J({})],
		params: {
			operation: 'executeQuery',
			executionMode: 'independent',
			query: 'CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)',
			replacementsJson: '[]',
			...params,
		},
	});
}

/** Count rows in `t` for the database selected by `params`, via the node cycle. */
async function countRows(cred: Cred, params: Record<string, unknown>): Promise<number> {
	const rows = await run({
		cred,
		items: [J({})],
		params: {
			operation: 'executeQuery',
			executionMode: 'independent',
			query: 'SELECT COUNT(*) AS n FROM t',
			replacementsJson: '[]',
			...params,
		},
	});
	return (rows[0].json as Record<string, unknown>).n as number;
}

describe('Sqlite multi-database selection integration', () => {
	let baseDir: string;

	beforeEach(() => {
		baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-multidb-'));
	});

	afterEach(() => {
		rmrf(baseDir);
	});

	it('a) baseDirectory + per-item database a.db / b.db -> two independent DBs inside it', async () => {
		const cred = { baseDirectory: baseDir };
		await createTable(cred, { database: 'a.db' });
		await createTable(cred, { database: 'b.db' });

		// Two items, each targeting a different database via an expression.
		await run({
			cred,
			items: [J({ id: 1, v: 'a' }), J({ id: 1, v: 'b' })],
			params: {
				operation: 'insert',
				executionMode: 'independent',
				table: TABLE,
				columns: ['id', 'v'],
				database: (i: number) => ['a.db', 'b.db'][i],
			},
		});

		// Both files were created inside the base directory.
		expect(fs.existsSync(path.join(baseDir, 'a.db'))).toBe(true);
		expect(fs.existsSync(path.join(baseDir, 'b.db'))).toBe(true);

		// Each DB holds only its own row (operated independently).
		const rowsA = await run({
			cred,
			items: [J({})],
			params: {
				operation: 'select',
				executionMode: 'independent',
				table: TABLE,
				outputColumns: [],
				database: 'a.db',
			},
		});
		const rowsB = await run({
			cred,
			items: [J({})],
			params: {
				operation: 'select',
				executionMode: 'independent',
				table: TABLE,
				outputColumns: [],
				database: 'b.db',
			},
		});
		expect(rowsA).toHaveLength(1);
		expect((rowsA[0].json as Record<string, unknown>).v).toBe('a');
		expect(rowsB).toHaveLength(1);
		expect((rowsB[0].json as Record<string, unknown>).v).toBe('b');

		// Counts are independent.
		expect(await countRows(cred, { database: 'a.db' })).toBe(1);
		expect(await countRows(cred, { database: 'b.db' })).toBe(1);
	});

	it('b) databasePathOverride (absolute, outside baseDir) overrides the credential path', async () => {
		const overridePath = path.join(os.tmpdir(), `n8n-multidb-override-${Date.now()}.db`);
		const ignoredPath = path.join(baseDir, 'ignored.db');
		const cred = { baseDirectory: baseDir, databasePath: ignoredPath };

		try {
			await createTable(cred, { databasePathOverride: overridePath });

			await run({
				cred,
				items: [J({ id: 1, v: 'override' })],
				params: {
					operation: 'insert',
					executionMode: 'independent',
					table: TABLE,
					columns: ['id', 'v'],
					databasePathOverride: overridePath,
				},
			});

			// The override file received the row; the credential's ignored.db did
			// not even get created.
			expect(fs.existsSync(overridePath)).toBe(true);
			expect(fs.existsSync(ignoredPath)).toBe(false);

			const rows = await run({
				cred,
				items: [J({})],
				params: {
					operation: 'select',
					executionMode: 'independent',
					table: TABLE,
					outputColumns: [],
					databasePathOverride: overridePath,
				},
			});
			expect(rows).toHaveLength(1);
			expect((rows[0].json as Record<string, unknown>).v).toBe('override');
		} finally {
			rmDb(overridePath);
		}
	});

	it('c) database with ../escape.db -> throws clear error and writes nothing outside', async () => {
		const escapePath = path.resolve(baseDir, '../escape.db');
		expect(fs.existsSync(escapePath)).toBe(false);

		await expect(
			run({
				cred: { baseDirectory: baseDir },
				items: [J({ id: 1, v: 'escape' })],
				params: {
					operation: 'insert',
					executionMode: 'independent',
					table: TABLE,
					columns: ['id', 'v'],
					database: '../escape.db',
				},
			}),
		).rejects.toThrow(/escapes the base directory/);

		// Nothing was written outside the base directory.
		expect(fs.existsSync(escapePath)).toBe(false);
		// And nothing inside it either (no a.db-style file leaked).
		expect(fs.readdirSync(baseDir)).toHaveLength(0);
	});

	it('d) retrocompat: credential with only databasePath behaves identically to before', async () => {
		const dbPath = path.join(os.tmpdir(), `n8n-multidb-retro-${Date.now()}.db`);
		const cred = { databasePath: dbPath };

		try {
			await createTable(cred, {});

			await run({
				cred,
				items: [J({ id: 1, v: 'legacy' })],
				params: {
					operation: 'insert',
					executionMode: 'independent',
					table: TABLE,
					columns: ['id', 'v'],
				},
			});

			const rows = await run({
				cred,
				items: [J({})],
				params: {
					operation: 'select',
					executionMode: 'independent',
					table: TABLE,
					outputColumns: [],
				},
			});
			expect(rows).toHaveLength(1);
			expect((rows[0].json as Record<string, unknown>).v).toBe('legacy');
		} finally {
			rmDb(dbPath);
		}
	});

	it('nothing configured (no databasePath, no baseDirectory, no node fields) -> clear error', async () => {
		await expect(
			run({
				cred: {},
				items: [J({})],
				params: {
					operation: 'select',
					executionMode: 'independent',
					table: TABLE,
					outputColumns: [],
				},
			}),
		).rejects.toThrow(/no database configured/);
	});
});