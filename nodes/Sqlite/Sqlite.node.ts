import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { routeSqlite } from './actions/router';
import { getColumns } from './methods/loadOptions';
import { getTables } from './methods/listSearch';
import { sqliteApiTest } from './methods/credentialTest';

const OPERATOR_OPTIONS = [
	{ name: '=', value: '=' },
	{ name: '!=', value: '!=' },
	{ name: '>', value: '>' },
	{ name: '<', value: '<' },
	{ name: '>=', value: '>=' },
	{ name: '<=', value: '<=' },
	{ name: 'LIKE', value: 'LIKE' },
	{ name: 'IS NULL', value: 'IS NULL' },
	{ name: 'IS NOT NULL', value: 'IS NOT NULL' },
];

const TABLE_OPERATIONS = ['select', 'insert', 'update', 'delete', 'upsert'];

const COLUMN_LOAD_OPTIONS = {
	loadOptionsMethod: 'getColumns',
	loadOptionsDependsOn: ['table.value'],
};

export class Sqlite implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SQLite',
		name: 'sqlite',
		icon: 'file:sqlite.svg',
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Run SQL against a local SQLite database (node-sqlite3-wasm)',
		defaults: {
			name: 'SQLite',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'sqliteApi',
				required: true,
				testedBy: 'sqliteApiTest',
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Database',
						value: 'database',
						description: 'Operations on a SQLite database',
					},
				],
				default: 'database',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['database'],
					},
				},
				options: [
					{
						name: 'Create or Update',
						value: 'upsert',
						description:
							'Create a new record, or update the current one if it already exists (upsert).',
						action: 'Upsert rows',
					},
					{
						name: 'Delete',
						value: 'delete',
						description: 'Delete rows from a table',
						action: 'Delete rows',
					},
					{
						name: 'Execute Query',
						value: 'executeQuery',
						description: 'Run a raw SQL query with bound replacements',
						action: 'Execute query',
					},
					{
						name: 'Insert',
						value: 'insert',
						description: 'Insert rows into a table',
						action: 'Insert rows',
					},
					{
						name: 'Select Rows',
						value: 'select',
						description: 'Read rows from a table',
						action: 'Select rows',
					},
					{
						name: 'Update',
						value: 'update',
						description: 'Update rows in a table',
						action: 'Update rows',
					},
				],
				default: 'select',
			},
			{
				displayName: 'Read Only',
				name: 'readOnly',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['database'],
					},
				},
				description:
					'Open the database read-only. The engine rejects ALL writes — recommended when exposing this node to an AI agent that should only query data.',
			},
			{
				displayName: 'Confirm Destructive Operation',
				name: 'confirmDestructive',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['database'],
					},
				},
				description:
					'Allow operations that affect every row of a table or drop/truncate it (DELETE/UPDATE without WHERE, DROP, TRUNCATE). When OFF, those operations are blocked before execution. Leave OFF for AI agents so a prompt-injected mass write cannot run.',
			},
			{
				displayName: 'Execution Mode',
				name: 'executionMode',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['database'],
					},
				},
				options: [
					{
						name: 'Independent',
						value: 'independent',
						description: 'Each input item runs as its own statement',
					},
					{
						name: 'Transaction',
						value: 'transaction',
						description: 'All items run inside one BEGIN/COMMIT (rolled back on any error)',
					},
					{
						name: 'Multi-Row Insert',
						value: 'singleMultiRow',
						description: 'Insert only: one INSERT with all rows',
					},
				],
				default: 'independent',
				description: 'How input items are executed',
			},
			{
				displayName: 'Table',
				name: 'table',
				type: 'resourceLocator',
				default: { mode: 'name', value: '' },
				required: true,
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						typeOptions: {
							searchListMethod: 'getTables',
							searchable: true,
						},
					},
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
					},
				],
				displayOptions: {
					show: {
						resource: ['database'],
						operation: TABLE_OPERATIONS,
					},
				},
				description: 'The SQLite table to operate on',
			},
			// --- select ---
			{
				displayName: 'Output Columns',
				name: 'outputColumns',
				type: 'multiOptions',
				typeOptions: COLUMN_LOAD_OPTIONS,
				default: [],
				displayOptions: {
					show: {
						resource: ['database'],
						operation: ['select'],
					},
				},
				description: 'Columns to return. Leave empty to select all (*).',
			},
			{
				displayName: 'Where Conditions',
				name: 'whereConditions',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				placeholder: 'Add condition',
				displayOptions: {
					show: {
						resource: ['database'],
						operation: ['select'],
					},
				},
				options: [
					{
						name: 'condition',
						displayName: 'Condition',
						values: [
							{
								displayName: 'Column',
								name: 'column',
								type: 'string',
								default: '',
								description: 'Column name to filter on',
							},
							{
								displayName: 'Operator',
								name: 'operator',
								type: 'options',
								options: OPERATOR_OPTIONS,
								default: '=',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								description: 'Value to compare. Use an expression for non-string types.',
							},
						],
					},
				],
			},
			{
				displayName: 'Order By',
				name: 'orderBy',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				placeholder: 'Add ordering',
				displayOptions: {
					show: {
						resource: ['database'],
						operation: ['select'],
					},
				},
				options: [
					{
						name: 'term',
						displayName: 'Term',
						values: [
							{
								displayName: 'Column',
								name: 'column',
								type: 'string',
								default: '',
							},
							{
								displayName: 'Direction',
								name: 'direction',
								type: 'options',
								options: [
									{ name: 'ASC', value: 'ASC' },
									{ name: 'DESC', value: 'DESC' },
								],
								default: 'ASC',
							},
						],
					},
				],
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['database'],
						operation: ['select'],
					},
				},
				description: 'Max rows to return. 0 = no limit.',
			},
			// --- insert / upsert columns ---
			{
				displayName: 'Columns',
				name: 'columns',
				type: 'multiOptions',
				typeOptions: COLUMN_LOAD_OPTIONS,
				default: [],
				displayOptions: {
					show: {
						resource: ['database'],
						operation: ['insert', 'upsert'],
					},
				},
				description:
					'Columns to insert. Leave empty to use the union of the input items fields (in first-seen order).',
			},
			// --- update / delete / upsert match columns ---
			{
				displayName: 'Match Columns',
				name: 'matchColumns',
				type: 'multiOptions',
				typeOptions: COLUMN_LOAD_OPTIONS,
				default: [],
				displayOptions: {
					show: {
						resource: ['database'],
						operation: ['update', 'delete', 'upsert'],
					},
				},
				description:
					'Columns used to match rows (WHERE for update/delete, conflict target for upsert). Values come from each input item.',
			},
			// --- update set columns ---
			{
				displayName: 'Update Columns',
				name: 'updateColumns',
				type: 'multiOptions',
				typeOptions: COLUMN_LOAD_OPTIONS,
				default: [],
				displayOptions: {
					show: {
						resource: ['database'],
						operation: ['update'],
					},
				},
				description:
					'Columns to SET. Leave empty to SET every item field that is not a match column.',
			},
			// --- executeQuery ---
			{
				displayName: 'Query',
				name: 'query',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['database'],
						operation: ['executeQuery'],
					},
				},
				description:
					'SQL with 1-indexed $1, $2 ... placeholders. Values are bound, never interpolated. With Read Only OFF this runs arbitrary SQL (including writes); the destructive guard only catches DELETE/UPDATE without WHERE, DROP and TRUNCATE — do not expose it to an AI agent without Read Only ON.',
				placeholder: 'SELECT * FROM "users" WHERE id = $1',
			},
			{
				displayName: 'Replacements (JSON Array)',
				name: 'replacementsJson',
				type: 'string',
				default: '[]',
				displayOptions: {
					show: {
						resource: ['database'],
						operation: ['executeQuery'],
					},
				},
				description:
					'JSON array of values for $1, $2 ... (or an expression that returns an array).',
				placeholder: '["alice", 42]',
			},
		],
	};

	methods = {
		listSearch: {
			getTables,
		},
		loadOptions: {
			getColumns,
		},
		credentialTest: {
			sqliteApiTest,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		try {
			return await routeSqlite.call(this);
		} catch (error) {
			if (!this.continueOnFail()) {
				// routeSqlite already throws NodeOperationError for every fatal
				// setup failure; rethrow it as-is, and wrap anything unexpected.
				throw error instanceof NodeOperationError
					? error
					: new NodeOperationError(this.getNode(), error as Error);
			}
			// Fatal setup error thrown outside the per-item loop (e.g. the DB
			// cannot be opened or the credential has no databasePath): there is
			// no single item to attribute it to, so emit one error row per input
			// item to keep the output aligned with the input.
			const items = this.getInputData();
			const message = error instanceof Error ? error.message : String(error);
			return [
				items.map((item, i) => ({
					json: { error: message } as unknown as IDataObject,
					pairedItem: { item: i },
				})),
			];
		}
	}
}