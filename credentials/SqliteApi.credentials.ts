import type { INodeProperties, ICredentialType } from 'n8n-workflow';

/**
 * Credentials for the SQLite (node-sqlite3-wasm) node.
 *
 * Holds the absolute filesystem path to the SQLite database file, OR an
 * absolute Base Directory that individual nodes pick a database file inside of.
 * There is no network authentication here — the "credential" is just a stable,
 * reusable place to store this config so multiple nodes/operations can share it.
 *
 * Selection model (retrocompatible):
 * - Legacy: set only `databasePath` to a single absolute file path. Every node
 *   using this credential opens that one database.
 * - Multi-db: set `baseDirectory` to an absolute directory and leave
 *   `databasePath` empty; each node then picks a file inside it via its
 *   `Database` field (sandboxed, cannot escape the Base Directory).
 *
 * The resolved path is validated again at runtime in `resolveDatabasePath` and
 * `createConnection` (never trust only the credential test), so this definition
 * only declares the fields.
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
			displayName: 'Database File Path',
			name: 'databasePath',
			type: 'string',
			default: '',
			placeholder: '/absolute/path/to/database.sqlite',
			description:
				'Absolute path to a single SQLite database file on the n8n host filesystem. Optional when using Base Directory + the node’s Database field; required otherwise.',
		},
		{
			displayName: 'Base Directory',
			name: 'baseDirectory',
			type: 'string',
			default: '',
			placeholder: '/absolute/path/to/databases',
			description:
				"Optional absolute directory. When set, each node can pick a database file inside it via the node's Database field. Leave empty to use a single Database File Path.",
		},
	];
}