import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
	ICredentialTestFunctions,
	ICredentialsDecrypted,
	ICredentialDataDecryptedObject,
	INodeCredentialTestResult,
} from 'n8n-workflow';

import { closeConnection, createConnection } from '../transport/connection';

/**
 * Credential test for `sqliteApi`.
 *
 * Two valid configurations:
 * - `databasePath`: an absolute path to a single database file. Validated by
 *   opening it (creating on open if missing) and running `SELECT 1`.
 * - `baseDirectory`: an absolute path to an existing directory that individual
 *   nodes pick a database file inside of. Validated by checking the directory
 *   exists and is absolute (no file is created here; each node opens its own).
 *
 * The resolved path is re-validated on every real connection in
 * `resolveDatabasePath` / `createConnection`, so this is a UI convenience, not
 * the sole gate.
 */
export async function sqliteApiTest(
	this: ICredentialTestFunctions,
	credential: ICredentialsDecrypted<ICredentialDataDecryptedObject>,
): Promise<INodeCredentialTestResult> {
	const data = (credential.data ?? {}) as { databasePath?: string; baseDirectory?: string };
	const databasePath = data.databasePath ?? '';
	const baseDirectory = data.baseDirectory ?? '';

	if (databasePath.length > 0) {
		let db;
		try {
			db = createConnection(databasePath);
			db.get('SELECT 1 AS ok');
			return { status: 'OK', message: 'Connection OK' };
		} catch (error) {
			return { status: 'Error', message: (error as Error).message };
		} finally {
			closeConnection(db);
		}
	}

	if (baseDirectory.length > 0) {
		if (!path.isAbsolute(baseDirectory)) {
			return { status: 'Error', message: 'Base Directory must be an absolute path' };
		}
		try {
			if (!fs.existsSync(baseDirectory) || !fs.statSync(baseDirectory).isDirectory()) {
				return { status: 'Error', message: 'Base Directory does not exist or is not a directory' };
			}
		} catch (error) {
			return { status: 'Error', message: (error as Error).message };
		}
		return { status: 'OK', message: 'Base Directory OK' };
	}

	return {
		status: 'Error',
		message: 'Set either Database File Path or Base Directory',
	};
}