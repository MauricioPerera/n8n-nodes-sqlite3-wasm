import type { INodeProperties, ICredentialType } from 'n8n-workflow';

/**
 * Credentials for the SQLite (node-sqlite3-wasm) node.
 *
 * Holds the absolute filesystem path to the SQLite database file. There is no
 * network authentication here — the "credential" is just a stable, reusable
 * place to store the path so multiple nodes/operations can share it.
 *
 * The path is validated again at runtime in `createConnection` (never trust
 * only the credential test), so this definition only declares the field.
 */
export class SqliteApi implements ICredentialType {
	name = 'sqliteApi';

	displayName = 'SQLite API';

	/**
	 * kebab-case identifier used in the project setup docs; points users at
	 * the README rather than a remote URL.
	 */
	documentationUrl = 'sqlite';

	properties: INodeProperties[] = [
		{
			displayName: 'Database Path',
			name: 'databasePath',
			type: 'string',
			default: '',
			placeholder: '/absolute/path/to/database.sqlite',
			description:
				'Absolute path to the SQLite database file on the n8n host filesystem',
		},
	];
}