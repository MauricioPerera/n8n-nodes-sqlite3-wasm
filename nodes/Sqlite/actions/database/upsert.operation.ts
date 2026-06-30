import type { IExecuteFunctions } from 'n8n-workflow';

import { escapeSqlIdentifier, normalizeBindValue } from '../../helpers/normalize';
import type { BindValue } from '../../helpers/queryBuilder';
import { type BuiltQuery, readStringArray, resolveTable } from '../types';

/**
 * Build an UPSERT (INSERT ... ON CONFLICT) for one item.
 *
 * - `columns` (selected or all item keys) are inserted.
 * - `matchColumns` is the conflict target. Required non-empty.
 * - The SET side covers the columns that are NOT match columns. When that set
 *   is empty (A5: upsert with only the match column), the clause becomes
 *   `ON CONFLICT(...) DO NOTHING` instead of an empty `DO UPDATE SET`.
 * - Bind order: insert values first, then update values (none for DO NOTHING).
 * - All values normalized through `normalizeBindValue` (A1).
 */
export function buildUpsertQuery(ctx: IExecuteFunctions, itemIndex: number): BuiltQuery {
	const table = resolveTable(ctx, itemIndex);
	const matchColumns = readStringArray(ctx, 'matchColumns', itemIndex);
	if (matchColumns.length === 0) {
		throw new Error('Upsert requires at least one match column (conflict target)');
	}

	const row = ctx.getInputData()[itemIndex].json as Record<string, unknown>;
	const columns = readStringArray(ctx, 'columns', itemIndex);
	const effectiveColumns = columns.length > 0 ? columns : Object.keys(row);
	if (effectiveColumns.length === 0) {
		throw new Error('Upsert requires at least one column');
	}

	const insertValues: BindValue[] = effectiveColumns.map((c) => normalizeBindValue(row[c]));
	const colList = effectiveColumns.map((c) => escapeSqlIdentifier(c)).join(', ');
	const placeholders = effectiveColumns.map(() => '?').join(', ');
	const conflictCols = matchColumns.map((c) => escapeSqlIdentifier(c)).join(', ');

	const updateColumns = effectiveColumns.filter((c) => !matchColumns.includes(c));

	let conflictClause: string;
	let updateValues: BindValue[] = [];
	if (updateColumns.length === 0) {
		// A5: nothing to update -> DO NOTHING, no extra bind values.
		conflictClause = `ON CONFLICT (${conflictCols}) DO NOTHING`;
	} else {
		const setClause = updateColumns.map((c) => `${escapeSqlIdentifier(c)} = ?`).join(', ');
		updateValues = updateColumns.map((c) => normalizeBindValue(row[c]));
		conflictClause = `ON CONFLICT (${conflictCols}) DO UPDATE SET ${setClause}`;
	}

	const sql = `INSERT INTO ${escapeSqlIdentifier(table)} (${colList}) VALUES (${placeholders}) ${conflictClause}`;
	const values: BindValue[] = [...insertValues, ...updateValues];
	return { sql, values };
}