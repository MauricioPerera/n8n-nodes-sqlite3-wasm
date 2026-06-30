import * as os from 'node:os';
import * as path from 'node:path';

import { resolveDatabasePath, type ResolveDatabasePathOptions } from '../resolvePath';

/**
 * Frozen property-tests for resolveDatabasePath.
 *
 * The oracle re-derives the expected result straight from the spec (override
 * absolute wins; else database inside an absolute baseDirectory, sandboxed by
 * containment; else the legacy credentialDatabasePath; else throw) — it does
 * NOT call the target. Every assertion compares the target against the oracle,
 * plus explicit message checks for the user-facing error strings.
 */

type Outcome = { ok: true; value: string } | { ok: false; message: string };

/** Reference implementation of the spec, independent of the target. */
function oracle(opts: ResolveDatabasePathOptions): Outcome {
	const ne = (s: unknown): s is string => typeof s === 'string' && s.length > 0;
	const override = opts.override ?? '';
	const database = opts.database ?? '';
	const baseDirectory = opts.baseDirectory ?? '';
	const credentialDatabasePath = opts.credentialDatabasePath ?? '';

	if (ne(override)) {
		if (!path.isAbsolute(override)) return { ok: false, message: 'override-not-absolute' };
		return { ok: true, value: override };
	}
	if (ne(database)) {
		if (!ne(baseDirectory)) return { ok: false, message: 'database-needs-base' };
		if (!path.isAbsolute(baseDirectory)) return { ok: false, message: 'base-not-absolute' };
		const base = path.resolve(baseDirectory);
		const resolved = path.resolve(base, database);
		if (resolved !== base && !resolved.startsWith(base + path.sep)) {
			return { ok: false, message: 'escape' };
		}
		return { ok: true, value: resolved };
	}
	if (ne(credentialDatabasePath)) {
		if (!path.isAbsolute(credentialDatabasePath)) {
			return { ok: false, message: 'credential-not-absolute' };
		}
		return { ok: true, value: credentialDatabasePath };
	}
	return { ok: false, message: 'none' };
}

/** Run the target, returning the same Outcome shape the oracle produces. */
function runTarget(opts: ResolveDatabasePathOptions): Outcome {
	try {
		return { ok: true, value: resolveDatabasePath(opts) };
	} catch (error) {
		return { ok: false, message: (error as Error).message };
	}
}

/** Assert target and oracle agree (both return the same path, or both throw). */
function expectAgreement(opts: ResolveDatabasePathOptions): void {
	const expected = oracle(opts);
	const actual = runTarget(opts);
	expect(actual.ok).toBe(expected.ok);
	if (expected.ok && actual.ok) {
		expect(actual.value).toBe(expected.value);
	}
}

describe('resolveDatabasePath', () => {
	const base = path.join(os.tmpdir(), `n8n-resolve-base-${Date.now()}`);
	const absoluteOverride = path.join(os.tmpdir(), `n8n-resolve-override-${Date.now()}.db`);
	const absoluteCredential = path.join(os.tmpdir(), `n8n-resolve-cred-${Date.now()}.db`);

	it('override absolute -> returns override', () => {
		expectAgreement({ override: absoluteOverride });
		expect(resolveDatabasePath({ override: absoluteOverride })).toBe(absoluteOverride);
	});

	it('override relative -> throws (absolute required)', () => {
		expectAgreement({ override: 'relative/path.db' });
		expect(() => resolveDatabasePath({ override: 'relative/path.db' })).toThrow(
			/databasePathOverride must be an absolute path/,
		);
	});

	it('override empty string is treated as unset (falls through)', () => {
		expectAgreement({ override: '', credentialDatabasePath: absoluteCredential });
	});

	it('database + absolute baseDirectory -> resolves inside the base', () => {
		expectAgreement({ baseDirectory: base, database: 'a.db' });
		expect(resolveDatabasePath({ baseDirectory: base, database: 'a.db' })).toBe(
			path.join(base, 'a.db'),
		);
	});

	it('database nested subpath -> resolves inside the base', () => {
		expectAgreement({ baseDirectory: base, database: 'sub/dir/app.db' });
		expect(resolveDatabasePath({ baseDirectory: base, database: 'sub/dir/app.db' })).toBe(
			path.join(base, 'sub', 'dir', 'app.db'),
		);
	});

	it('database with ../.. that escapes -> throws (path traversal blocked)', () => {
		expectAgreement({ baseDirectory: base, database: '../../escape.db' });
		expect(() =>
			resolveDatabasePath({ baseDirectory: base, database: '../../escape.db' }),
		).toThrow(/escapes the base directory/);
	});

	it('database with ../escape.db -> throws (escapes the base)', () => {
		expectAgreement({ baseDirectory: base, database: '../escape.db' });
		expect(() =>
			resolveDatabasePath({ baseDirectory: base, database: '../escape.db' }),
		).toThrow(/escapes the base directory/);
	});

	it('database as an absolute path outside the base -> throws (escapes)', () => {
		const outside = path.resolve(os.tmpdir(), 'n8n-resolve-outside.db');
		expectAgreement({ baseDirectory: base, database: outside });
		expect(() => resolveDatabasePath({ baseDirectory: base, database: outside })).toThrow(
			/escapes the base directory/,
		);
	});

	it('database set without baseDirectory -> throws (requires a Base Directory)', () => {
		expectAgreement({ database: 'a.db' });
		expect(() => resolveDatabasePath({ database: 'a.db' })).toThrow(
			/requires a Base Directory/,
		);
	});

	it('database with a relative baseDirectory -> throws (base must be absolute)', () => {
		expectAgreement({ baseDirectory: 'relative/dir', database: 'a.db' });
		expect(() =>
			resolveDatabasePath({ baseDirectory: 'relative/dir', database: 'a.db' }),
		).toThrow(/baseDirectory must be an absolute path/);
	});

	it('only credentialDatabasePath (absolute) -> returns it (retrocompat)', () => {
		expectAgreement({ credentialDatabasePath: absoluteCredential });
		expect(resolveDatabasePath({ credentialDatabasePath: absoluteCredential })).toBe(
			absoluteCredential,
		);
	});

	it('credentialDatabasePath relative -> throws (absolute required)', () => {
		expectAgreement({ credentialDatabasePath: 'relative.db' });
		expect(() => resolveDatabasePath({ credentialDatabasePath: 'relative.db' })).toThrow(
			/databasePath must be an absolute path/,
		);
	});

	it('nothing configured -> throws (no database configured)', () => {
		expectAgreement({});
		expect(() => resolveDatabasePath({})).toThrow(/no database configured/);
	});

	it('override takes precedence over database and credential', () => {
		expectAgreement({
			override: absoluteOverride,
			baseDirectory: base,
			database: 'a.db',
			credentialDatabasePath: absoluteCredential,
		});
		expect(
			resolveDatabasePath({
				override: absoluteOverride,
				baseDirectory: base,
				database: 'a.db',
				credentialDatabasePath: absoluteCredential,
			}),
		).toBe(absoluteOverride);
	});

	it('database takes precedence over credentialDatabasePath', () => {
		expectAgreement({
			baseDirectory: base,
			database: 'a.db',
			credentialDatabasePath: absoluteCredential,
		});
		expect(
			resolveDatabasePath({
				baseDirectory: base,
				database: 'a.db',
				credentialDatabasePath: absoluteCredential,
			}),
		).toBe(path.join(base, 'a.db'));
	});

	it('a sibling directory sharing a string prefix of the base is rejected (sep guard)', () => {
		// base = `<tmp>/n8n-resolve-prefix`; `../n8n-resolve-prefix-evil/x.db` resolves
		// to `<tmp>/n8n-resolve-prefix-evil/x.db`, which shares the `<tmp>/n8n-resolve-prefix`
		// string prefix but is NOT under the base. The `base + path.sep` containment
		// check must reject it (a naive `startsWith(base)` would wrongly accept it).
		const prefixBase = path.join(os.tmpdir(), 'n8n-resolve-prefix');
		const sibling = 'n8n-resolve-prefix-evil';
		expectAgreement({ baseDirectory: prefixBase, database: `../${sibling}/x.db` });
		expect(() =>
			resolveDatabasePath({ baseDirectory: prefixBase, database: `../${sibling}/x.db` }),
		).toThrow(/escapes the base directory/);
	});
});