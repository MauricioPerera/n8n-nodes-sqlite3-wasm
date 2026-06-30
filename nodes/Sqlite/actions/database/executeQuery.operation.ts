import type { IExecuteFunctions } from 'n8n-workflow';

import { normalizeBindValue } from '../../helpers/normalize';
import { prepareReplacements, type BindValue } from '../../helpers/queryBuilder';
import { parseJsonArray } from '../../helpers/columns';
import type { BuiltQuery } from '../types';

/**
 * Build a safe raw query for one item (A6).
 *
 * The query text uses 1-indexed `$N` placeholders; `prepareReplacements`
 * converts them to positional `?` and collects the values in appearance order.
 * The values are then normalized through `normalizeBindValue`. No expression
 * text is ever interpolated into the SQL — values only enter via bindings.
 *
 * There is intentionally no "Allow Expressions (Unsafe)" toggle: the query
 * field itself may be an expression, but its values must flow through
 * `replacements` -> `$N` -> `?`.
 */
export function buildExecuteQuery(ctx: IExecuteFunctions, itemIndex: number): BuiltQuery {
	const query = ctx.getNodeParameter('query', itemIndex) as string;
	if (typeof query !== 'string' || query.trim() === '') {
		throw new Error('executeQuery requires a non-empty query');
	}

	const replacementsRaw = ctx.getNodeParameter('replacementsJson', itemIndex, '[]');
	const replacements = parseJsonArray(replacementsRaw);

	const prepared = prepareReplacements(query, replacements);
	const values: BindValue[] = prepared.values.map((v) => normalizeBindValue(v));
	return { sql: prepared.sql, values };
}