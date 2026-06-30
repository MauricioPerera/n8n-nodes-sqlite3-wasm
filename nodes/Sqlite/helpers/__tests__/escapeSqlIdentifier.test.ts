import { escapeSqlIdentifier } from '../normalize';

/**
 * Frozen property-tests for escapeSqlIdentifier. The oracle re-derives the
 * expected value from the spec — it does not call the target.
 */
describe('escapeSqlIdentifier', () => {
	const oracle = (s: string): string => '"' + s.replace(/"/g, '""') + '"';

	const cases = ['name', 'na"me', '', '"', 'a"b"c', 'order', 'with space', 'SELECT'];

	it('matches the oracle on every case', () => {
		for (const c of cases) {
			expect(escapeSqlIdentifier(c)).toBe(oracle(c));
		}
	});

	it('is always wrapped in double quotes', () => {
		for (const c of cases) {
			const out = escapeSqlIdentifier(c);
			expect(out.startsWith('"')).toBe(true);
			expect(out.endsWith('"')).toBe(true);
		}
	});

	it('output quote count is 2 + 2 * input quote count', () => {
		for (const c of cases) {
			const out = escapeSqlIdentifier(c);
			const inputQ = (c.match(/"/g) ?? []).length;
			const outQ = (out.match(/"/g) ?? []).length;
			expect(outQ).toBe(2 + 2 * inputQ);
		}
	});

	it('empty string -> ""', () => {
		expect(escapeSqlIdentifier('')).toBe('""');
	});

	it('single double-quote -> four double-quotes', () => {
		expect(escapeSqlIdentifier('"')).toBe('""""');
	});

	it('is injective (distinct inputs -> distinct outputs)', () => {
		const outs = new Set(cases.map(escapeSqlIdentifier));
		expect(outs.size).toBe(cases.length);
	});
});