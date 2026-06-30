import type { IExecuteFunctions } from 'n8n-workflow';

import type { BindValue } from '../helpers/queryBuilder';

/**
 * A fully-built, ready-to-execute SQL statement with positional `?`
 * placeholders and an already-normalized bind array (every value has passed
 * through `normalizeBindValue`, so no `undefined`/boolean can reach the driver).
 */
export interface BuiltQuery {
	sql: string;
	values: BindValue[];
}

/** A per-item operation builder: turns node parameters + one item into a query. */
export type OperationBuilder = (ctx: IExecuteFunctions, itemIndex: number) => BuiltQuery;

/**
 * Resolve the selected table to a plain string.
 *
 * `table` is a `resourceLocator` parameter, so its value may arrive as a
 * `{ mode, value }` object (list or name mode) or, when set via an expression,
 * as a raw string. Accept both and require a non-empty name.
 */
export function resolveTable(ctx: IExecuteFunctions, itemIndex: number): string {
	const raw = ctx.getNodeParameter('table', itemIndex) as unknown;
	let table: unknown;
	if (typeof raw === 'string') {
		table = raw;
	} else if (raw && typeof raw === 'object' && 'value' in (raw as Record<string, unknown>)) {
		table = (raw as Record<string, unknown>).value;
	}
	if (typeof table !== 'string' || table.trim() === '') {
		throw new Error('Table is required');
	}
	return table.trim();
}

/** Read a `multiOptions` parameter as a string array, defaulting to `[]`. */
export function readStringArray(ctx: IExecuteFunctions, name: string, itemIndex: number): string[] {
	const raw = ctx.getNodeParameter(name, itemIndex, []) as unknown;
	if (Array.isArray(raw)) {
		return raw.filter((v): v is string => typeof v === 'string');
	}
	if (typeof raw === 'string' && raw.trim() !== '') {
		return [raw.trim()];
	}
	return [];
}