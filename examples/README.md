# Example workflows

Importable n8n workflow templates for the **SQLite** node (`n8n-nodes-sqlite3-wasm`).

## How to import

1. In n8n: **Workflows → ⋮ (top right) → Import from File…** and pick one of the `.json` files here.
2. Open each **SQLite** node and select your **SQLite API** credential
   (the templates ship with a placeholder credential id, so you must reassign it).
   - The credential's **Database File Path** must be an **absolute** path on the n8n host,
     e.g. `/data/app.db` (Linux) or `D:\data\app.db` (Windows). The directory must exist;
     the file is created on first write.
3. Click **Execute Workflow**.

## Templates

| File | What it shows |
|------|---------------|
| `01-insert-and-read.json` | Create a table, **insert** rows mapped from a data node, read them back. |
| `02-upsert-sync.json` | Idempotent **upsert** (match on `id`): existing rows update, new rows insert — no duplicates. Re-run to see the update path. |
| `03-safe-parameterized-query.json` | **Safe raw SQL** with `$1, $2 …` placeholders and a Replacements array (values are bound — no SQL injection). |

## Notes

- Each **Execute Query** node runs **one** SQL statement. Split `CREATE` and `INSERT` into separate nodes (the templates already do).
- For AI agents, enable **Read-only** on the node so the engine rejects any write.
- This node is **self-hosted only** (it reads/writes a local SQLite file).
