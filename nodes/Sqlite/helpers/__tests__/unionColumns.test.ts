import { unionColumns } from '../queryBuilder';

/**
 * Frozen property-tests for unionColumns. The oracle re-derives the first-seen
 * union independently from the spec.
 */
describe('unionColumns', () => {
	const oracle = (rows: Record<string, unknown>[]): string[] => {
		const seen = new Set<string>();
		const out: string[] = [];
		for (const row of rows) {
			for (const key of Object.keys(row)) {
				if (!seen.has(key)) {
					seen.add(key);
					out.push(key);
				}
			}
		}
		return out;
	};

	it('matches the oracle on heterogeneous rows (A2 union)', () => {
		const rows = [
			{ a: 1, b: 2 },
			{ b: 3, c: 4 },
			{ a: 5, c: 6, d: 7 },
		];
		expect(unionColumns(rows)).toEqual(oracle(rows));
		expect(unionColumns(rows)).toEqual(['a', 'b', 'c', 'd']);
	});

	it('preserves first-seen order, not sorted order', () => {
		const rows = [{ z: 1, a: 2, m: 3 }];
		expect(unionColumns(rows)).toEqual(['z', 'a', 'm']);
	});

	it('deduplicates keys repeated across rows', () => {
		const rows = [{ a: 1 }, { a: 2, b: 3 }, { a: 4, b: 5 }];
		expect(unionColumns(rows)).toEqual(['a', 'b']);
	});

	it('returns [] for empty input', () => {
		expect(unionColumns([])).toEqual([]);
	});

	it('returns [] when rows have no own keys', () => {
		expect(unionColumns([{}, {}])).toEqual([]);
	});

	it('does not mutate the input rows', () => {
		const rows = [{ a: 1, b: 2 }];
		const snapshot = JSON.stringify(rows);
		unionColumns(rows);
		expect(JSON.stringify(rows)).toBe(snapshot);
	});
});