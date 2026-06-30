import { Buffer } from 'node:buffer';

/**
 * Pure helpers for the SQLite node.
 *
 * These are the gateable units of the foundation: each function has a frozen
 * property-test contract and is validated through the CCDD gate. Keep them
 * dependency-free and side-effect-free so they stay independently testable.
 */

/**
 * Escape a SQLite identifier (column/table name) by wrapping it in double
 * quotes and doubling any internal double quotes.
 */
export function escapeSqlIdentifier(identifier: string): string {
	return '"' + identifier.replace(/"/g, '""') + '"';
}

/**
 * Normalize an arbitrary JS value into a value node-sqlite3-wasm can bind.
 * `undefined` -> `null`, `boolean` -> `1`/`0`, objects throw.
 */
export function normalizeBindValue(
	value: unknown,
): string | number | bigint | Buffer | null {
	if (value === undefined || value === null) {
		return null;
	}
	const type = typeof value;
	if (type === 'boolean') {
		return value ? 1 : 0;
	}
	if (type === 'string' || type === 'number' || type === 'bigint') {
		return value as string | number | bigint;
	}
	if (value instanceof Uint8Array) {
		// Buffer is a subclass of Uint8Array; pass Buffers through unchanged,
		// copy plain Uint8Arrays into a Buffer so the declared return type
		// holds and node-sqlite3-wasm gets a binary blob it can bind.
		return Buffer.isBuffer(value) ? value : Buffer.from(value);
	}
	throw new Error(
		`Unsupported value for SQLite binding (type: ${type}); cannot bind objects, arrays, dates or functions`,
	);
}

/**
 * Normalize a query row so it is JSON-safe: bigints that fit a safe integer
 * become numbers, otherwise strings; everything else is left untouched.
 */
export function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(row)) {
		if (typeof value === 'bigint') {
			const asNumber = Number(value);
			out[key] = Number.isSafeInteger(asNumber) ? asNumber : String(value);
		} else {
			out[key] = value;
		}
	}
	return out;
}