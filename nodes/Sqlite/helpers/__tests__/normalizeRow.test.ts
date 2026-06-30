import { normalizeRow } from '../normalize';

/**
 * Frozen property-tests for normalizeRow. Independent oracle: bigint ->
 * number if Number.isSafeInteger(Number(v)), else string; everything else
 * unchanged.
 */
describe('normalizeRow', () => {
	const oracle = (v: unknown): unknown => {
		if (typeof v === 'bigint') {
			const n = Number(v);
			return Number.isSafeInteger(n) ? n : String(v);
		}
		return v;
	};

	it('bigint within safe range -> number', () => {
		const row = normalizeRow({ id: 5n, count: 0n, neg: -7n });
		expect(row.id).toBe(5);
		expect(row.count).toBe(0);
		expect(row.neg).toBe(-7);
		expect(typeof row.id).toBe('number');
	});

	it('bigint beyond safe range -> string', () => {
		const big = BigInt(Number.MAX_SAFE_INTEGER) + 2n;
		const row = normalizeRow({ id: big });
		expect(typeof row.id).toBe('string');
		expect(row.id).toBe(String(big));
	});

	it('non-bigint values are left untouched', () => {
		const src = { a: 'x', b: 1, c: null, d: undefined, e: true, f: 3.5 };
		expect(normalizeRow(src)).toEqual(src);
	});

	it('matches the oracle on a mixed row', () => {
		const big = BigInt(Number.MAX_SAFE_INTEGER) + 5n;
		const src = { safe: 12n, huge: big, name: 'n', n: 3, flag: true, z: null };
		const expected: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(src)) expected[k] = oracle(v);
		expect(normalizeRow(src)).toEqual(expected);
	});

	it('result is JSON-serializable even with huge bigints', () => {
		const big = BigInt(Number.MAX_SAFE_INTEGER) + 100n;
		const row = normalizeRow({ id: big, name: 'ok' });
		expect(() => JSON.stringify(row)).not.toThrow();
		expect(JSON.parse(JSON.stringify(row)).id).toBe(String(big));
	});

	it('does not mutate the input row', () => {
		const big = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
		const src = { id: big };
		normalizeRow(src);
		expect(typeof src.id).toBe('bigint');
	});
});