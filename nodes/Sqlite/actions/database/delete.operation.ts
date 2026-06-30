import type { IExecuteFunctions } from 'n8n-workflow';

import { escapeSqlIdentifier, normalizeBindValue } from '../../helpers/normalize';
import { buildWhereClause, type BindValue } from '../../helpers/queryBuilder';
import { type BuiltQuery, readStringArray, resolveTable } from '../types';

/**
 * Build a DELETE for one item. `matchColumns` form the WHERE, values taken
 * from the item and built via the gated `buildWhereClause`. Required non-empty
 * (guards against an accidental full-table delete). All bind values normalized
 * through `normalizeBindValue` (A1).
 */
export function buildDeleteQuery(ctx: IExecuteFunctions, itemIndex: number): BuiltQuery {
	const table = resolveTable(ctx, itemIndex);
	const matchColumns = readStringArray(ctx, 'matchColumns', itemIndex);
	if (matchColumns.length === 0) {
		throw new Error('Delete requires at least one match column');
	}

	const row = ctx.getInputData()[itemIndex].json as Record<string, unknown>;
	const where = buildWhereClause(
		matchColumns.map((c) => ({ column: c, operator: '=', value: row[c] })),
	);

	const sql = `DELETE FROM ${escapeSqlIdentifier(table)} ${where.clause}`.trim();
	const values: BindValue[] = where.values.map((v) => normalizeBindValue(v));
	return { sql, values };
}