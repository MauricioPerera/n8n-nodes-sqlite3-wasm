import path from 'node:path';
import { Database } from 'node-sqlite3-wasm';

export interface CreateConnectionOptions {
	/** Open the database read-only. Implies `fileMustExist`. */
	readOnly?: boolean;
	/** `PRAGMA busy_timeout` value in ms (default 5000). */
	busyTimeoutMs?: number;
}

/**
 * Validate that `databasePath` is a non-empty absolute filesystem path.
 *
 * Re-validated here at runtime on every connection attempt — the credential
 * definition only declares the field, it must not be trusted as the sole gate.
 */
function assertAbsoluteDatabasePath(databasePath: unknown): asserts databasePath is string {
	if (typeof databasePath !== 'string' || databasePath.length === 0) {
		throw new Error(
			`SQLite databasePath must be a non-empty string, got: ${typeof databasePath}`,
		);
	}
	if (!path.isAbsolute(databasePath)) {
		throw new Error(
			`SQLite databasePath must be an absolute path, got: "${databasePath}"`,
		);
	}
}

/**
 * Open a SQLite (node-sqlite3-wasm) connection to `databasePath`.
 *
 * - Validates the path is absolute at runtime (never trusts the credential only).
 * - Opens with `fileMustExist` when read-only (a read-only DB cannot be created
 *   on the fly), or with the default create-on-open behaviour when writable.
 * - Sets `PRAGMA busy_timeout` per connection so serialized access does not hit
 *   a hard `database is locked` under contention.
 *
 * The caller owns the connection lifecycle: call `closeConnection(db)` when
 * done. node-sqlite3-wasm is not GC-friendly, so explicit close is mandatory.
 */
export function createConnection(
	databasePath: string,
	options: CreateConnectionOptions = {},
): Database {
	assertAbsoluteDatabasePath(databasePath);

	const { readOnly = false, busyTimeoutMs = 5000 } = options;
	if (!Number.isInteger(busyTimeoutMs) || busyTimeoutMs < 0) {
		throw new Error(
			`SQLite busyTimeoutMs must be a non-negative integer, got: ${busyTimeoutMs}`,
		);
	}

	const db = new Database(databasePath, {
		// A read-only database cannot be created on open, so it must already
		// exist. For writable databases, allow create-on-open (fileMustExist
		// defaults to false).
		fileMustExist: readOnly,
		readOnly,
	});

	try {
		// busyTimeoutMs is a validated non-negative integer, safe to interpolate.
		db.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
	} catch (error) {
		try {
			db.close();
		} catch {
			// Swallow close error during cleanup; the original PRAGMA error is
			// the one we want to surface.
		}
		throw error;
	}

	return db;
}

/**
 * Close a SQLite connection idempotently.
 *
 * Safe to call multiple times or on an already-closed/null connection: a bare
 * `db.close()` on a closed handle throws, so we guard with `isOpen` and wrap in
 * try/catch. Never swallows the *first* close error silently — it rethrows —
 * but tolerates the double-close case so cleanup paths stay robust.
 */
export function closeConnection(db: Database | null | undefined): void {
	if (!db) {
		return;
	}
	try {
		if (db.isOpen) {
			db.close();
		}
	} catch (error) {
		// If the handle is somehow already closed, `isOpen` lied or raced; do
		// not surface that as a failure during cleanup.
		if (!db.isOpen) {
			return;
		}
		throw error;
	}
}