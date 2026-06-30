import { isDestructiveOperation } from '../security';

/**
 * Frozen property-tests for isDestructiveOperation. The oracle re-derives the
 * expected result from the spec (DROP leading / TRUNCATE anywhere / DELETE or
 * UPDATE without a top-level WHERE) — it does not call the target.
 */
describe('isDestructiveOperation', () => {
	const oracle = (sql: string): boolean => {
		const n = sql.trimStart().toUpperCase();
		if (n.length === 0) return false;
		if (n === 'DROP' || n.startsWith('DROP ')) return true;
		if (/\bTRUNCATE\b/.test(n)) return true;
		const isDelete = n === 'DELETE' || n.startsWith('DELETE ');
		const isUpdate = n === 'UPDATE' || n.startsWith('UPDATE ');
		if (isDelete || isUpdate) return !/\bWHERE\b/i.test(n);
		return false;
	};

	const destructiveCases: ReadonlyArray<string> = [
		'DROP TABLE users',
		'DROP INDEX idx',
		'DROP VIEW v',
		'drop table users',
		'  DROP TABLE users',
		'TRUNCATE TABLE users',
		'truncate users',
		'DELETE FROM users',
		'delete from users',
		'  DELETE FROM users',
		'UPDATE users SET a = 1',
		'update users set a = 1',
		'UPDATE "users" SET "a" = 1',
	];

	const safeCases: ReadonlyArray<string> = [
		'SELECT * FROM users',
		'INSERT INTO users VALUES (1)',
		'DELETE FROM users WHERE id = 1',
		'UPDATE users SET a = 1 WHERE id = 1',
		'delete from users where id = 1',
		'WITH x AS (SELECT 1) SELECT * FROM x',
		'PRAGMA table_info(users)',
		'CREATE TABLE t (a)',
		'',
		'   ',
		'SELECT 1',
	];

	it('flags destructive cases', () => {
		for (const sql of destructiveCases) {
			expect(isDestructiveOperation(sql)).toBe(oracle(sql));
			expect(isDestructiveOperation(sql)).toBe(true);
		}
	});

	it('does not flag safe cases', () => {
		for (const sql of safeCases) {
			expect(isDestructiveOperation(sql)).toBe(oracle(sql));
			expect(isDestructiveOperation(sql)).toBe(false);
		}
	});

	it('treats empty / whitespace-only as non-destructive', () => {
		expect(isDestructiveOperation('')).toBe(false);
		expect(isDestructiveOperation('   \n\t ')).toBe(false);
	});

	it('is case-insensitive on the leading token', () => {
		expect(isDestructiveOperation('DrOp TABLE t')).toBe(true);
		expect(isDestructiveOperation('delete FROM t')).toBe(true);
		expect(isDestructiveOperation('UPDATE t SET a = 1')).toBe(true);
	});

	it('does not treat DROP as a substring of another token as destructive', () => {
		expect(isDestructiveOperation('SELECT drop_col FROM t')).toBe(false);
	});
});