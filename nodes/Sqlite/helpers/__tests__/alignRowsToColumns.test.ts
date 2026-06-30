import { alignRowsToColumns } from '../queryBuilder';

/**
 * Frozen property-tests for alignRowsToColumns. The oracle re-derives the
 * aligned matrix independently: each row projected onto `columns` in order,
 * missing columns -> null. This is the A2 (heterogeneous -> null) and A3
 * (column<->value order) contract.
 */
describe('alignRowsToColumns', () => {
	const oracle = (
		rows: Record<string, unknown>[],
		columns: string[],
	): unknown[][] =>
		rows.map((row) =>
			columns.map((col) =>
				Object.prototype.hasOwnProperty.call(row, col) ? row[col] : null,
			),
		);

	it('matches the oracle on heterogeneous rows (A2: missing -> null)', () => {
		const rows = [{ a: 1, b: 2 }, { a: 3 }, { b: 4, c: 5 }];
		const columns = ['a', 'b', 'c'];
		expect(alignRowsToColumns(rows, columns)).toEqual(oracle(rows, columns));
		expect(alignRowsToColumns(rows, columns)).toEqual([
			[1, 2, null],
			[3, null, null],
			[null, 4, 5],
		]);
	});

	it('aligns values to column order, not key order (A3)', () => {
		// row keys come in reverse order; output must follow `columns`
		const rows = [{ c: 5, b: 2, a: 1 }];
		expect(alignRowsToColumns(rows, ['a', 'b', 'c'])).toEqual([[1, 2, 5]]);
	});

	it('ignores extra keys not in columns', () => {
		const rows = [{ a: 1, extra: 'x', b: 2 }];
		expect(alignRowsToColumns(rows, ['a', 'b'])).toEqual([[1, 2]]);
	});

	it('treats a key holding null as present (not filled)', () => {
		const rows = [{ a: null, b: 2 }];
		expect(alignRowsToColumns(rows, ['a', 'b'])).toEqual([[null, 2]]);
	});

	it('returns one empty array per row when columns is empty', () => {
		const rows = [{ a: 1 }, { b: 2 }];
		expect(alignRowsToColumns(rows, [])).toEqual([[], []]);
	});

	it('returns [] for no rows', () => {
		expect(alignRowsToColumns([], ['a'])).toEqual([]);
	});

	it('preserves raw value types (boolean, bigint) without normalizing', () => {
		const rows = [{ a: true, b: 5n }];
		expect(alignRowsToColumns(rows, ['a', 'b'])).toEqual([[true, 5n]]);
	});

	it('does not mutate the input rows', () => {
		const rows = [{ a: 1 }];
		const snapshot = JSON.stringify(rows);
		alignRowsToColumns(rows, ['a', 'b']);
		expect(JSON.stringify(rows)).toBe(snapshot);
	});
});