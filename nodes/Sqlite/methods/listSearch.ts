import type { ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';

import { closeConnection, createConnection } from '../transport/connection';

/**
 * List user tables in the database as a searchable list.
 *
 * Queries `sqlite_master` for `type='table'`, excluding SQLite's internal
 * `sqlite_%` tables, ordered by name. Opens a read-only connection (the DB
 * must already exist). The optional filter/paginationToken arguments of the
 * listSearch signature are not used (SQLite lists tables in one shot).
 */
export async function getTables(this: ILoadOptionsFunctions): Promise<INodeListSearchResult> {
	const creds = await this.getCredentials<{ databasePath?: string }>('sqliteApi');
	const databasePath = creds.databasePath;
	if (typeof databasePath !== 'string' || databasePath.length === 0) {
		return { results: [] };
	}

	const db = createConnection(databasePath, { readOnly: true });
	try {
		const rows = db.all(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
		) as Array<{ name: string }>;
		return {
			results: rows.map((r) => ({ name: r.name, value: r.name })),
		};
	} finally {
		closeConnection(db);
	}
}