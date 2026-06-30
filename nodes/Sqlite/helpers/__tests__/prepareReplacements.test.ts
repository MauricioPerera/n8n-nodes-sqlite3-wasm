import { prepareReplacements } from '../queryBuilder';

/**
 * Frozen property-tests for prepareReplacements. The oracle re-derives the
 * $N -> ? conversion and ordered value array independently from the spec. This
 * is the A6 safe-execution contract: only $N placeholders are bound, never raw
 * expression text interpolated into SQL.
 */
describe('prepareReplacements', () => {
	const oracle = (
		query: string,
		replacements: unknown[],
	): { sql: string; values: unknown[] } => {
		const values: unknown[] = [];
		const sql = query.replace(/\$(\d+)/g, (_m, digits: string) => {
			const idx = Number(digits) - 1;
			if (idx < 0 || idx >= replacements.length) {
				throw new Error('out of range');
			}
			values.push(replacements[idx]);
			return '?';
		});
		return { sql, values };
	};

	it('matches the oracle with no placeholders', () => {
		const r = prepareReplacements('SELECT 1', [1, 2]);
		expect(r).toEqual(oracle('SELECT 1', [1, 2]));
		expect(r).toEqual({ sql: 'SELECT 1', values: [] });
	});

	it('matches the oracle with a single $1', () => {
		const r = prepareReplacements('SELECT * FROM t WHERE id = $1', [42]);
		expect(r).toEqual(oracle('SELECT * FROM t WHERE id = $1', [42]));
		expect(r.sql).toBe('SELECT * FROM t WHERE id = ?');
		expect(r.values).toEqual([42]);
	});

	it('matches the oracle with multiple placeholders in order', () => {
		const q = 'SELECT $1, $2 FROM t WHERE a = $1 AND b = $3';
		const reps = [10, 20, 30];
		expect(prepareReplacements(q, reps)).toEqual(oracle(q, reps));
		expect(prepareReplacements(q, reps).sql).toBe('SELECT ?, ? FROM t WHERE a = ? AND b = ?');
		// values follow appearance order: $1, $2, $1, $3
		expect(prepareReplacements(q, reps).values).toEqual([10, 20, 10, 30]);
	});

	it('handles out-of-order references ($2 before $1)', () => {
		const r = prepareReplacements('SELECT $2, $1', ['a', 'b']);
		expect(r.values).toEqual(['b', 'a']);
		expect(r.sql).toBe('SELECT ?, ?');
	});

	it('throws on $0 (1-indexed, no zero)', () => {
		expect(() => prepareReplacements('SELECT $0', [])).toThrow(/out of range/);
	});

	it('throws on $N beyond the replacements length', () => {
		expect(() => prepareReplacements('SELECT $3', [1, 2])).toThrow(/out of range/);
		expect(() => prepareReplacements('SELECT $1', [])).toThrow(/out of range/);
	});

	it('leaves a non-numeric $ untouched', () => {
		const r = prepareReplacements('SELECT $abc, $1', [5]);
		expect(r.sql).toBe('SELECT $abc, ?');
		expect(r.values).toEqual([5]);
	});

	it('returns raw values without normalization', () => {
		const r = prepareReplacements('INSERT INTO t VALUES ($1, $2)', [true, undefined]);
		expect(r.values).toEqual([true, undefined]);
	});
});