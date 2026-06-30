import { buildWhereClause, type WhereCondition } from '../queryBuilder';

/**
 * Frozen property-tests for buildWhereClause. The oracle re-derives the clause
 * and raw value array from the spec — it does not call the target. Covers the
 * operator whitelist, IS NULL / IS NOT NULL (no placeholder), the empty-value
 * rejection for comparison operators, and identifier escaping.
 */
describe('buildWhereClause', () => {
	const esc = (s: string): string => '"' + s.replace(/"/g, '""') + '"';
	const OPS_NO_PLACEHOLDER = new Set(['IS NULL', 'IS NOT NULL']);
	const COMPARISON = new Set(['>', '<', '>=', '<=']);

	const oracle = (conditions: WhereCondition[]): { clause: string; values: unknown[] } => {
		if (conditions.length === 0) return { clause: '', values: [] };
		const frags: string[] = [];
		const values: unknown[] = [];
		for (const c of conditions) {
			const op = c.operator.toUpperCase();
			if (OPS_NO_PLACEHOLDER.has(op)) {
				frags.push(`${esc(c.column)} ${op}`);
			} else {
				frags.push(`${esc(c.column)} ${op} ?`);
				values.push(c.value);
			}
		}
		return { clause: `WHERE ${frags.join(' AND ')}`, values };
	};

	it('matches the oracle on valued operators', () => {
		const conditions: WhereCondition[] = [
			{ column: 'id', operator: '=', value: 1 },
			{ column: 'name', operator: '!=', value: 'x' },
			{ column: 'age', operator: '>=', value: 18 },
		];
		expect(buildWhereClause(conditions)).toEqual(oracle(conditions));
		expect(buildWhereClause(conditions).clause).toBe('WHERE "id" = ? AND "name" != ? AND "age" >= ?');
		expect(buildWhereClause(conditions).values).toEqual([1, 'x', 18]);
	});

	it('IS NULL / IS NOT NULL produce no placeholder and no value', () => {
		const conditions: WhereCondition[] = [
			{ column: 'a', operator: 'IS NULL', value: undefined },
			{ column: 'b', operator: 'is not null', value: undefined },
		];
		expect(buildWhereClause(conditions)).toEqual(oracle(conditions));
		expect(buildWhereClause(conditions).clause).toBe('WHERE "a" IS NULL AND "b" IS NOT NULL');
		expect(buildWhereClause(conditions).values).toEqual([]);
	});

	it('LIKE is a valued operator', () => {
		const conditions: WhereCondition[] = [{ column: 'name', operator: 'LIKE', value: '%foo%' }];
		expect(buildWhereClause(conditions)).toEqual(oracle(conditions));
		expect(buildWhereClause(conditions).clause).toBe('WHERE "name" LIKE ?');
	});

	it('operator is case-insensitive', () => {
		expect(buildWhereClause([{ column: 'a', operator: 'like', value: 'x' }]).clause).toBe(
			'WHERE "a" LIKE ?',
		);
	});

	it('escapes identifiers with embedded double quotes', () => {
		expect(
			buildWhereClause([{ column: 'a"b', operator: '=', value: 1 }]).clause,
		).toBe('WHERE "a""b" = ?');
	});

	it('returns empty clause for no conditions', () => {
		expect(buildWhereClause([])).toEqual({ clause: '', values: [] });
	});

	it('passes raw values through without normalization (boolean stays boolean)', () => {
		expect(buildWhereClause([{ column: 'flag', operator: '=', value: true }]).values).toEqual([
			true,
		]);
	});

	it('rejects an operator not in the whitelist', () => {
		expect(() => buildWhereClause([{ column: 'a', operator: '<>', value: 1 }])).toThrow(
			/Invalid WHERE operator/,
		);
	});

	it('rejects empty/whitespace value for >, <, >=, <= (no Number("")===0)', () => {
		for (const op of ['>', '<', '>=', '<=']) {
			expect(() => buildWhereClause([{ column: 'a', operator: op, value: '' }])).toThrow(
				/Empty value not allowed/,
			);
			expect(() => buildWhereClause([{ column: 'a', operator: op, value: '   ' }])).toThrow(
				/Empty value not allowed/,
			);
		}
	});

	it('allows empty string for equality operators', () => {
		// '=' with '' is a legitimate equality test, not a numeric comparison.
		const r = buildWhereClause([{ column: 'a', operator: '=', value: '' }]);
		expect(r.clause).toBe('WHERE "a" = ?');
		expect(r.values).toEqual(['']);
	});

	it('allows numeric-looking values for comparison operators', () => {
		for (const op of COMPARISON) {
			const r = buildWhereClause([{ column: 'a', operator: op, value: '5' }]);
			expect(r.values).toEqual(['5']);
		}
	});
});