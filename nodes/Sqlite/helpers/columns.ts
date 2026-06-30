import { escapeSqlIdentifier } from './normalize';

/**
 * Small, non-gated parsing helpers shared by the operations layer. The
 * gateable, spec-bearing logic lives in `queryBuilder.ts`; these are trivial
 * string/syntax utilities that delegate escaping to the already-gated
 * `escapeSqlIdentifier`.
 */

/**
 * Split a comma-separated column list into trimmed, non-empty names.
 * `''` -> `[]`.
 */
export function parseColumnList(raw: string): string[] {
	return raw
		.split(',')
		.map((c) => c.trim())
		.filter((c) => c.length > 0);
}

/**
 * Render a column list as a SQL select/insert list. A literal `*` is preserved
 * verbatim; every other name is escaped via `escapeSqlIdentifier`.
 */
export function escapeColumnList(columns: string[]): string {
	return columns.map((c) => (c === '*' ? '*' : escapeSqlIdentifier(c))).join(', ');
}

/**
 * Parse a JSON array from a string. Throws if the result is not an array.
 * Accepts the parsed value directly if it is already an array (so the param
 * may be supplied either as a JSON literal or as an expression yielding one).
 */
export function parseJsonArray(raw: unknown): unknown[] {
	const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
	if (!Array.isArray(parsed)) {
		throw new Error('Replacements must be a JSON array');
	}
	return parsed;
}