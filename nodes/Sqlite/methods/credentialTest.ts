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
 * Validates that the stored path is absolute and that a SQLite database can be
 * opened there (creating it on open if it does not yet exist), then runs a
 * trivial `SELECT 1` to confirm the handle is usable. The path is re-validated
 * on every real connection in `createConnection`, so this is a UI convenience,
 * not the sole gate.
 */
export async function sqliteApiTest(
	this: ICredentialTestFunctions,
	credential: ICredentialsDecrypted<ICredentialDataDecryptedObject>,
): Promise<INodeCredentialTestResult> {
	const data = (credential.data ?? {}) as { databasePath?: string };
	const databasePath = data.databasePath;

	if (typeof databasePath !== 'string' || databasePath.length === 0) {
		return { status: 'Error', message: 'Database Path is required' };
	}

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