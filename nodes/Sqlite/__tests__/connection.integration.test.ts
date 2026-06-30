import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { closeConnection, createConnection } from '../transport/connection';
import { normalizeBindValue, normalizeRow } from '../helpers/normalize';

/**
 * Real integration test against node-sqlite3-wasm on disk: open a temp DB,
 * create a table, insert values normalized through `normalizeBindValue`
 * (including boolean true, undefined -> null, and a bigint beyond
 * Number.MAX_SAFE_INTEGER), read them back, run the rows through
 * `normalizeRow`, and assert the result is JSON-serializable.
 */
describe('SQLite connection integration', () => {
	let dbPath: string;

	beforeEach(() => {
		dbPath = path.join(os.tmpdir(), `n8n-sqlite-int-${Date.now()}-${process.pid}.sqlite`);
	});

	afterEach(() => {
		try {
			fs.unlinkSync(dbPath);
		} catch {
			// best-effort cleanup; ignore missing file
		}
		// node-sqlite3-wasm also creates a -journal next to the db in DELETE mode
		try {
			fs.unlinkSync(`${dbPath}-journal`);
		} catch {
			// ignore
		}
	});

	it('round-trips normalized values and yields JSON-safe rows', () => {
		const db = createConnection(dbPath, { busyTimeoutMs: 5000 });

		db.exec('CREATE TABLE samples (id INTEGER PRIMARY KEY, flag INTEGER, note TEXT, big INTEGER)');

		// Values that exercise the bind normalization rules:
		//   true -> 1, undefined -> null, a bigint beyond MAX_SAFE_INTEGER.
		const values: unknown[] = [
			1,
			true,
			undefined,
			BigInt(Number.MAX_SAFE_INTEGER) + 2n,
		];
		const bound = values.map((v) => normalizeBindValue(v));

		db.run(
			'INSERT INTO samples (id, flag, note, big) VALUES (?, ?, ?, ?)',
			bound as (string | number | bigint | Buffer | null)[],
		);

		const rows = db.all('SELECT id, flag, note, big FROM samples');
		const safe = rows.map((row) => normalizeRow(row as Record<string, unknown>));

		// The whole point of normalizeRow: JSON.stringify must not throw on
		// rows that contain bigints coming back from node-sqlite3-wasm.
		expect(() => JSON.stringify(safe)).not.toThrow();

		const parsed = JSON.parse(JSON.stringify(safe));
		expect(parsed).toHaveLength(1);
		expect(parsed[0].id).toBe(1);
		expect(parsed[0].flag).toBe(1); // true -> 1
		expect(parsed[0].note).toBeNull(); // undefined -> null
		// bigint beyond safe range -> string (exact decimal preserved)
		expect(typeof parsed[0].big).toBe('string');
		expect(parsed[0].big).toBe(String(BigInt(Number.MAX_SAFE_INTEGER) + 2n));

		closeConnection(db);
	});

	it('createConnection rejects a relative path', () => {
		expect(() => createConnection('relative/path.sqlite')).toThrow(/absolute/i);
	});

	it('createConnection rejects an empty path', () => {
		expect(() => createConnection('')).toThrow(/non-empty/i);
	});
});