import { hasWhereClause } from '../security';

/**
 * Frozen property-tests for hasWhereClause. The oracle re-derives the expected
 * result from the spec (word-boundary, case-insensitive WHERE presence) — it
 * does not call the target.
 */
describe('hasWhereClause', () => {
	const oracle = (sql: string): boolean => /\bWHERE\b/i.test(sql);

	const cases: ReadonlyArray<readonly [string, boolean]> = [
		['SELECT * FROM t WHERE id = 1', true],
		['DELETE FROM t', false],
		['UPDATE t SET a = 1 WHERE id = 1', true],
		['select * from t where x', true],
		['DELETE FROM "users" WHERE "id" = 1', true],
		['DROP TABLE t', false],
		['INSERT INTO t VALUES (1)', false],
		['', false],
		['   DELETE FROM t', false],
		['WHERE', true],
		['wherever', false],
	];

	it('matches the oracle on all cases', () => {
		for (const [sql, expected] of cases) {
			expect(hasWhereClause(sql)).toBe(oracle(sql));
			expect(hasWhereClause(sql)).toBe(expected);
		}
	});

	it('is case-insensitive', () => {
		expect(hasWhereClause('select * from t Where x')).toBe(true);
		expect(hasWhereClause('SELECT * FROM t wHeRe x')).toBe(true);
	});

	it('does not match WHERE as a substring of another word', () => {
		expect(hasWhereClause('SELECT wherever FROM t')).toBe(false);
		expect(hasWhereClause('SELECT nowhere FROM t')).toBe(false);
	});
});