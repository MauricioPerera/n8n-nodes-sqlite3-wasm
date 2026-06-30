import { buildOrderByClause, type OrderByClause } from '../queryBuilder';

/**
 * Frozen property-tests for buildOrderByClause. The oracle re-derives the
 * clause from the spec (whitelisted ASC/DESC, escaped identifiers).
 */
describe('buildOrderByClause', () => {
	const esc = (s: string): string => '"' + s.replace(/"/g, '""') + '"';

	const oracle = (orderBy: OrderByClause[]): string => {
		if (orderBy.length === 0) return '';
		return `ORDER BY ${orderBy
			.map((i) => `${esc(i.column)} ${i.direction.toUpperCase()}`)
			.join(', ')}`;
	};

	it('matches the oracle on a single term', () => {
		const orderBy = [{ column: 'id', direction: 'ASC' }];
		expect(buildOrderByClause(orderBy)).toBe(oracle(orderBy));
		expect(buildOrderByClause(orderBy)).toBe('ORDER BY "id" ASC');
	});

	it('matches the oracle on multiple terms', () => {
		const orderBy = [
			{ column: 'a', direction: 'ASC' },
			{ column: 'b', direction: 'DESC' },
		];
		expect(buildOrderByClause(orderBy)).toBe(oracle(orderBy));
		expect(buildOrderByClause(orderBy)).toBe('ORDER BY "a" ASC, "b" DESC');
	});

	it('uppercases a lowercase direction', () => {
		expect(buildOrderByClause([{ column: 'id', direction: 'desc' }])).toBe('ORDER BY "id" DESC');
		expect(buildOrderByClause([{ column: 'id', direction: 'asc' }])).toBe('ORDER BY "id" ASC');
	});

	it('escapes identifiers with embedded double quotes', () => {
		expect(buildOrderByClause([{ column: 'a"b', direction: 'ASC' }])).toBe('ORDER BY "a""b" ASC');
	});

	it('returns empty string for no terms', () => {
		expect(buildOrderByClause([])).toBe('');
	});

	it('rejects a direction not in the whitelist', () => {
		expect(() => buildOrderByClause([{ column: 'a', direction: 'SIDEWAYS' }])).toThrow(
			/Invalid ORDER BY direction/,
		);
	});
});