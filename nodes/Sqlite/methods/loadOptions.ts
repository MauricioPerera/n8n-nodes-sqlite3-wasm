import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';

import { closeConnection, createConnection } from '../transport/connection';
import { escapeSqlIdentifier } from '../helpers/normalize';

/**
 * Load the column names of the configured table as dropdown options.
 *
 * Used by a `loadOptionsMethod` on column-type parameters so the user picks
 * from the real schema. Opens a read-only connection (the DB must already
 * exist), runs `PRAGMA table_info("table")` (identifier escaped, never
 * interpolated), and maps `name` -> option.
 */
export async function getColumns(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const tableRaw = this.getNodeParameter('table', 0) as unknown;
	const table =
		typeof tableRaw === 'string'
			? tableRaw
			: (tableRaw as { value?: string } | undefined)?.value;
	if (typeof table !== 'string' || table.trim() === '') {
		return [];
	}

	const creds = await this.getCredentials<{ databasePath?: string }>('sqliteApi');
	const databasePath = creds.databasePath;
	if (typeof databasePath !== 'string' || databasePath.length === 0) {
		return [];
	}

	const db = createConnection(databasePath, { readOnly: true });
	try {
		const rows = db.all(`PRAGMA table_info(${escapeSqlIdentifier(table)})`) as Array<{
			name: string;
		}>;
		return rows.map((r) => ({ name: r.name, value: r.name }));
	} finally {
		closeConnection(db);
	}
}