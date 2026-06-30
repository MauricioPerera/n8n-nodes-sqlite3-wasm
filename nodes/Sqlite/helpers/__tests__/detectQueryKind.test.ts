import { detectQueryKind } from '../queryBuilder';

/**
 * Frozen property-tests for detectQueryKind. The oracle re-derives the
 * expected kind from the spec (first-token keyword check) — it does not call
 * the target.
 */
describe('detectQueryKind', () => {
	const ROW_KEYWORDS = ['SELECT', 'WITH', 'PRAGMA', 'EXPLAIN', 'VALUES'];

	const oracle = (sql: string): 'rows' | 'changes' => {
		const t = sql.trimStart().toUpperCase();
		return ROW_KEYWORDS.some((kw) => t.startsWith(kw)) ? 'rows' : 'changes';
	};

	const rowCases = [
		'SELECT * FROM t',
		'  select id from t',
		'\n\tWITH x AS (SELECT 1) SELECT * FROM x',
		'PRAGMA table_info(t)',
		'pragma foreign_keys',
		'EXPLAIN SELECT * FROM t',
		'VALUES (1), (2)',
		'  values (1)',
		'SELECT',
	];

	const changeCases = [
		'INSERT INTO t VALUES (1)',
		'UPDATE t SET a = 1',
		'DELETE FROM t',
		'CREATE TABLE t (a)',
		'DROP TABLE t',
		'',
		'   ',
		'not a keyword',
	];

	it('matches the oracle on row-returning cases', () => {
		for (const c of rowCases) {
			expect(detectQueryKind(c)).toBe(oracle(c));
			expect(detectQueryKind(c)).toBe('rows');
		}
	});

	it('matches the oracle on change cases', () => {
		for (const c of changeCases) {
			expect(detectQueryKind(c)).toBe(oracle(c));
			expect(detectQueryKind(c)).toBe('changes');
		}
	});

	it('is case-insensitive on the first token', () => {
		expect(detectQueryKind('select * from t')).toBe('rows');
		expect(detectQueryKind('SeLeCt * from t')).toBe('rows');
		expect(detectQueryKind('WITH RECURSIVE x AS (SELECT 1) SELECT * FROM x')).toBe('rows');
	});

	it('treats empty / whitespace-only input as changes', () => {
		expect(detectQueryKind('')).toBe('changes');
		expect(detectQueryKind('   \n\t ')).toBe('changes');
	});
});