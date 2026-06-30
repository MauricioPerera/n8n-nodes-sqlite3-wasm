import type { IExecuteFunctions } from 'n8n-workflow';

import { escapeSqlIdentifier, normalizeBindValue } from '../../helpers/normalize';
import { buildWhereClause, type BindValue } from '../../helpers/queryBuilder';
import { type BuiltQuery, readStringArray, resolveTable } from '../types';

/**
 * Build an UPDATE for one item.
 *
 * - `matchColumns` form the WHERE (values taken from the item), built via the
 *   gated `buildWhereClause` so operators stay whitelisted. Required non-empty.
 * - `updateColumns` selects which columns to SET; if empty, SET every item key
 *   that is not a match column.
 * - SET values come first in the bind array, then WHERE values; all normalized
 *   through `normalizeBindValue` (A1).
 */
export function buildUpdateQuery(ctx: IExecuteFunctions, itemIndex: number): BuiltQuery {
	const table = resolveTable(ctx, itemIndex);
	const matchColumns = readStringArray(ctx, 'matchColumns', itemIndex);
	if (matchColumns.length === 0) {
		throw new Error('Update requires at least one match column');
	}

	const updateColumns = readStringArray(ctx, 'updateColumns', itemIndex);
	const row = ctx.getInputData()[itemIndex].json as Record<string, unknown>;

	const setColumns =
		updateColumns.length > 0
			? updateColumns
			: Object.keys(row).filter((k) => !matchColumns.includes(k));
	if (setColumns.length === 0) {
		throw new Error('Update requires at least one column to SET');
	}

	const setClause = setColumns.map((c) => `${escapeSqlIdentifier(c)} = ?`).join(', ');
	const setValues: BindValue[] = setColumns.map((c) => normalizeBindValue(row[c]));

	const where = buildWhereClause(
		matchColumns.map((c) => ({ column: c, operator: '=', value: row[c] })),
	);

	const sql = `UPDATE ${escapeSqlIdentifier(table)} SET ${setClause} ${where.clause}`.trim();
	const values: BindValue[] = [...setValues, ...where.values.map((v) => normalizeBindValue(v))];
	return { sql, values };
}