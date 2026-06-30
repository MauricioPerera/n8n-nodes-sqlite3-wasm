/**
 * Destructive-operation detection for the SQLite node (security guard).
 *
 * Pure, side-effect-free SQL-string inspection used by the router to block
 * mass-impact statements (DROP, TRUNCATE, DELETE/UPDATE without WHERE) unless
 * the user explicitly confirms via the `confirmDestructive` node parameter.
 *
 * This is a keyword heuristic, not a SQL parser: it inspects the leading token
 * and a top-level WHERE presence. It errs on the side of caution and is
 * deliberately conservative. It does NOT replace the read-only engine guard —
 * it complements it for the writable case (and for executeQuery, where raw SQL
 * cannot be inspected structurally).
 *
 * Known limitations (documented on the node parameters, not fixed here):
 * - A WHERE keyword appearing inside a string literal or quoted identifier
 *   would be detected as a clause (false "scoped"); an attacker would need to
 *   control the column name itself, which is not a realistic mass-destruction
 *   vector. The read-only mode is the strong guarantee for AI exposure.
 * - DROP is only matched as the leading token; a second statement after `;`
 *   is not executed by node-sqlite3-wasm's prepared-statement path anyway.
 */

/** Leading tokens whose entire statement is destructive (structure removal). */
const DESTRUCTIVE_PREFIXES = ['DROP'];

/** Keyword present anywhere in the statement -> destructive (SQLite has no
 *  TRUNCATE, but the intent is caught here before reaching the engine). */
const TRUNCATE_RE = /\bTRUNCATE\b/;

/** Word-boundary, case-insensitive WHERE detector. */
const WHERE_RE = /\bWHERE\b/i;

/** True when `normalized` is exactly `keyword` or starts with `keyword `. */
function startsWithKeyword(normalized: string, keyword: string): boolean {
	return normalized === keyword || normalized.startsWith(`${keyword} `);
}

/**
 * Whether a SQL statement carries a WHERE clause (top-level keyword presence).
 *
 * Detects the word `WHERE` (case-insensitive, word boundary) anywhere in the
 * statement. Used to tell a scoped DELETE/UPDATE (has WHERE) from a full-table
 * one (no WHERE).
 */
export function hasWhereClause(sql: string): boolean {
	return WHERE_RE.test(sql);
}

/**
 * Whether a statement is destructive (would affect the whole table or drop it).
 *
 * True for: DROP (leading token, any object), TRUNCATE (anywhere), DELETE
 * without WHERE, UPDATE without WHERE. False otherwise (SELECT, INSERT, scoped
 * DELETE/UPDATE, empty).
 */
export function isDestructiveOperation(sql: string): boolean {
	const normalized = sql.trimStart().toUpperCase();
	if (normalized.length === 0) {
		return false;
	}
	if (DESTRUCTIVE_PREFIXES.some((kw) => startsWithKeyword(normalized, kw))) {
		return true;
	}
	if (TRUNCATE_RE.test(normalized)) {
		return true;
	}
	if (
		startsWithKeyword(normalized, 'DELETE') ||
		startsWithKeyword(normalized, 'UPDATE')
	) {
		return !hasWhereClause(normalized);
	}
	return false;
}