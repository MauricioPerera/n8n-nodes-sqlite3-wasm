import type { IExecuteFunctions } from 'n8n-workflow';

import { escapeSqlIdentifier, normalizeBindValue } from '../../helpers/normalize';
import {
	buildOrderByClause,
	buildWhereClause,
	type BindValue,
	type OrderByClause,
	type WhereCondition,
} from '../../helpers/queryBuilder';
import { escapeColumnList } from '../../helpers/columns';
import { type BuiltQuery, readStringArray, resolveTable } from '../types';

/**
 * Build a SELECT query for one input item.
 *
 * - `outputColumns` empty -> `*` (select with empty output columns).
 * - WHERE via the gated `buildWhereClause` (whitelisted operators, IS NULL,
 *   empty-value rejection for comparisons).
 * - ORDER BY via the gated `buildOrderByClause` (ASC/DESC whitelist).
 * - `limit` is bound as a positional parameter (never interpolated).
 * - All bind values pass through `normalizeBindValue` (A1).
 */
export function buildSelectQuery(ctx: IExecuteFunctions, itemIndex: number): BuiltQuery {
	const table = resolveTable(ctx, itemIndex);
	const cols = readStringArray(ctx, 'outputColumns', itemIndex);
	const selectList = escapeColumnList(cols.length === 0 ? ['*'] : cols);

	const whereRaw = ctx.getNodeParameter('whereConditions', itemIndex, {}) as {
		condition?: WhereCondition[];
	};
	const where = buildWhereClause(whereRaw.condition ?? []);

	const orderByRaw = ctx.getNodeParameter('orderBy', itemIndex, {}) as {
		term?: OrderByClause[];
	};
	const orderBy = buildOrderByClause(orderByRaw.term ?? []);

	const limitRaw = ctx.getNodeParameter('limit', itemIndex, 0) as number;
	const limit = Math.trunc(Number(limitRaw));
	const hasLimit = Number.isFinite(limit) && limit > 0;

	const parts = [`SELECT ${selectList} FROM ${escapeSqlIdentifier(table)}`];
	if (where.clause) parts.push(where.clause);
	if (orderBy) parts.push(orderBy);
	if (hasLimit) parts.push('LIMIT ?');

	const values: BindValue[] = where.values.map((v) => normalizeBindValue(v));
	if (hasLimit) values.push(limit);

	return { sql: parts.join(' '), values };
}