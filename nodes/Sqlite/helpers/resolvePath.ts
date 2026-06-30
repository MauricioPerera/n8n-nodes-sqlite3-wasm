import path from 'node:path';

/**
 * Options for selecting which SQLite database file a node execution targets.
 *
 * Resolution order (first wins):
 * 1. `override`  — a full absolute path; wins over everything.
 * 2. `database`  — a file inside the credential's `baseDirectory` (sandboxed).
 * 3. `credentialDatabasePath` — the legacy single-path credential field.
 */
export interface ResolveDatabasePathOptions {
	/** Legacy credential field: an absolute path to a single database file. */
	credentialDatabasePath?: string;
	/** Optional absolute directory; when set, `database` is resolved inside it. */
	baseDirectory?: string;
	/** A database file inside `baseDirectory` (e.g. `sales.db` or `sub/app.db`). */
	database?: string;
	/** Full absolute path that overrides the credential entirely. */
	override?: string;
}

/** True only for a non-empty string (treats `undefined`/`''` as "not set"). */
function isNonEmpty(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

/**
 * Resolve the absolute filesystem path of the SQLite database to open for one
 * item, applying the multi-database selection rules and an anti-path-traversal
 * sandbox when `database` + `baseDirectory` are used.
 *
 * Pure: no filesystem access, no side effects. The returned path is always
 * absolute; `createConnection` re-validates that invariant at runtime.
 *
 * Containment check: both sides are normalized with `path.resolve`; `resolved`
 * must equal the base or start with `base + path.sep` — the separator prevents a
 * sibling like `/tmp/base-evil` from matching a base of `/tmp/base`. An absolute
 * `database` outside the base, or one carrying `..` that escapes, is rejected.
 *
 * Throws plain `Error` with a clear message on any misconfiguration so the
 * router can wrap it into a `NodeOperationError` carrying the item index.
 */
export function resolveDatabasePath(opts: ResolveDatabasePathOptions): string {
	const override = opts.override ?? '';
	const database = opts.database ?? '';
	const baseDirectory = opts.baseDirectory ?? '';
	const credentialDatabasePath = opts.credentialDatabasePath ?? '';
	if (isNonEmpty(override)) {
		if (!path.isAbsolute(override)) {
			throw new Error(`SQLite databasePathOverride must be an absolute path, got: "${override}"`);
		}
		return override;
	}
	if (isNonEmpty(database)) {
		if (!isNonEmpty(baseDirectory)) {
			throw new Error('Database field requires a Base Directory in the credential');
		}
		if (!path.isAbsolute(baseDirectory)) {
			throw new Error(`SQLite baseDirectory must be an absolute path, got: "${baseDirectory}"`);
		}
		const normalizedBase = path.resolve(baseDirectory);
		const resolved = path.resolve(normalizedBase, database);
		if (resolved !== normalizedBase && !resolved.startsWith(normalizedBase + path.sep)) {
			throw new Error('resolved path escapes the base directory');
		}
		return resolved;
	}
	if (isNonEmpty(credentialDatabasePath)) {
		if (!path.isAbsolute(credentialDatabasePath)) {
			throw new Error(`SQLite databasePath must be an absolute path, got: "${credentialDatabasePath}"`);
		}
		return credentialDatabasePath;
	}
	throw new Error('no database configured: set Database File Path, or Base Directory + Database');
}