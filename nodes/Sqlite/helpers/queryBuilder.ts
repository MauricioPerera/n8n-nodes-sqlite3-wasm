import { escapeSqlIdentifier } from './normalize';

/**
 * Pure SQL-string builders for the SQLite node.
 *
 * These are the gateable units of the operations layer: each function has a
 * frozen property-test contract and is validated through the CCDD integration
 * gate. They are dependency-free aside from the already-gated
 * `escapeSqlIdentifier`, and side-effect-free, so they stay independently
 * testable. They never touch a database connection.
 */

/** A value node-sqlite3-wasm accepts when binding positional parameters. */
export type BindValue = string | number | bigint | Buffer | null;

/** Raw WHERE condition as collected from node parameters; value is un-normalized. */
export interface WhereCondition {
	column: string;
	operator: string;
	value: unknown;
}

/** Raw ORDER BY term as collected from node parameters. */
export interface OrderByClause {
	column: string;
	direction: string;
}

const ROW_KEYWORDS = ['SELECT', 'WITH', 'PRAGMA', 'EXPLAIN', 'VALUES'];
const WHERE_OPS = new Set(['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IS NULL', 'IS NOT NULL']);
const COMPARISON_OPS = new Set(['>', '<', '>=', '<=']);
const ORDER_DIRECTIONS = new Set(['ASC', 'DESC']);

/**
 * Detect whether a SQL statement returns rows (use `db.all`) or performs
 * changes (use `db.run`). A trimmed, uppercased statement returns rows when its
 * first token is SELECT, WITH, PRAGMA, EXPLAIN or VALUES.
 */
export function detectQueryKind(sql: string): 'rows' | 'changes' {
	const trimmed = sql.trimStart().toUpperCase();
	for (const kw of ROW_KEYWORDS) {
		if (trimmed.startsWith(kw)) {
			return 'rows';
		}
	}
	return 'changes';
}

/**
 * Compute the first-seen-order union of keys across rows. Used by insert when
 * no explicit column list is supplied so heterogeneous rows still align (A2).
 */
export function unionColumns(rows: Record<string, unknown>[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const row of rows) {
		for (const key of Object.keys(row)) {
			if (!seen.has(key)) {
				seen.add(key);
				out.push(key);
			}
		}
	}
	return out;
}

/**
 * Project each row onto `columns`, in column order, filling missing columns
 * with `null`. Guarantees column<->value order alignment (A3) and that every
 * row has the same arity (A2). Values are returned raw; bind normalization is
 * the caller's responsibility.
 */
export function alignRowsToColumns(
	rows: Record<string, unknown>[],
	columns: string[],
): unknown[][] {
	const out: unknown[][] = [];
	for (const row of rows) {
		const values: unknown[] = [];
		for (const col of columns) {
			values.push(Object.prototype.hasOwnProperty.call(row, col) ? row[col] : null);
		}
		out.push(values);
	}
	return out;
}

/**
 * Build a `WHERE` clause from conditions, with placeholder `?` for valued
 * operators and no placeholder for `IS NULL` / `IS NOT NULL`. Operators are
 * whitelisted; empty/whitespace values are rejected for `>`, `<`, `>=`, `<=`
 * (so `Number('')` never silently becomes 0). Returns `{ clause: '', values: [] }`
 * for an empty condition list. Values are returned raw (un-normalized).
 */
export function buildWhereClause(conditions: WhereCondition[]): {
	clause: string;
	values: unknown[];
} {
	if (conditions.length === 0) {
		return { clause: '', values: [] };
	}
	const fragments: string[] = [];
	const values: unknown[] = [];
	for (const c of conditions) {
		const op = c.operator.toUpperCase();
		if (!WHERE_OPS.has(op)) {
			throw new Error(`Invalid WHERE operator: "${c.operator}"`);
		}
		if (op === 'IS NULL' || op === 'IS NOT NULL') {
			fragments.push(`${escapeSqlIdentifier(c.column)} ${op}`);
			continue;
		}
		if (COMPARISON_OPS.has(op) && typeof c.value === 'string' && c.value.trim() === '') {
			throw new Error(`Empty value not allowed for operator ${op} on column "${c.column}"`);
		}
		fragments.push(`${escapeSqlIdentifier(c.column)} ${op} ?`);
		values.push(c.value);
	}
	return { clause: `WHERE ${fragments.join(' AND ')}`, values };
}

/**
 * Build an `ORDER BY` clause from terms, or `''` for an empty list. Directions
 * are uppercased and whitelisted to ASC/DESC; anything else throws.
 */
export function buildOrderByClause(orderBy: OrderByClause[]): string {
	if (orderBy.length === 0) {
		return '';
	}
	const parts: string[] = [];
	for (const item of orderBy) {
		const dir = item.direction.toUpperCase();
		if (!ORDER_DIRECTIONS.has(dir)) {
			throw new Error(`Invalid ORDER BY direction: "${item.direction}"`);
		}
		parts.push(`${escapeSqlIdentifier(item.column)} ${dir}`);
	}
	return `ORDER BY ${parts.join(', ')}`;
}

/**
 * Convert a query using 1-indexed `$N` placeholders into one using positional
 * `?` placeholders plus an ordered raw value array (A6 safe-execution path).
 * Throws on out-of-range `$N`. Non-numeric `$` is left untouched. Values are
 * returned raw (un-normalized); the caller normalizes before binding.
 */
export function prepareReplacements(
	query: string,
	replacements: unknown[],
): { sql: string; values: unknown[] } {
	const values: unknown[] = [];
	const sql = query.replace(/\$(\d+)/g, (_match, digits: string) => {
		const idx = Number(digits) - 1;
		if (idx < 0 || idx >= replacements.length) {
			throw new Error(
				`Replacement $${digits} is out of range (got ${replacements.length} replacements)`,
			);
		}
		values.push(replacements[idx]);
		return '?';
	});
	return { sql, values };
}