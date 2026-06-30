# n8n-nodes-sqlite3-wasm

An [n8n](https://n8n.io/) community node to run SQL against a local **SQLite** database file directly from your workflows.

It uses [`node-sqlite3-wasm`](https://www.npmjs.com/package/node-sqlite3-wasm) — a pure-WebAssembly build of SQLite — so there is **no native binary to compile**: it runs on any OS/Node version where n8n runs (Linux, Windows, macOS, ARM, Alpine/musl).

Built for the common case of teams moving spreadsheets/Excel processes into SQLite files and automating them in n8n.

[Installation](#installation) · [Operations](#operations) · [Credentials](#credentials) · [AI / tool use](#ai--tool-use) · [Compatibility](#compatibility) · [Usage](#usage)

## Installation

Follow the [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) and install the package `n8n-nodes-sqlite3-wasm`.

> **Self-hosted only.** This node reads and writes a SQLite **file on the n8n host's filesystem**. n8n Cloud is multi-tenant and gives you no persistent local filesystem, so this node (like any local-file SQLite node) only works on **self-hosted / Docker** n8n. That is by design, not a limitation of the implementation.

## Operations

Resource **Database**:

- **Select Rows** — columns, WHERE conditions, ORDER BY, LIMIT.
- **Insert** — auto-map item fields or pick columns; multi-row.
- **Update** — match columns + columns to set.
- **Delete** — by WHERE, or `truncate` / `drop` (guarded, see below).
- **Create or Update (Upsert)** — `ON CONFLICT` on the match columns.
- **Execute Query** — arbitrary SQL with safe `$1, $2 …` bound parameters.

Values are always bound as parameters; table/column identifiers are escaped. Booleans, `undefined`/null and big integers are normalized so they never crash a bind or the JSON output.

## Credentials

A single credential **SQLite API** with one field:

- **Database File Path** — absolute path to the `.db`/`.sqlite` file on the n8n host (e.g. `/data/app.db` or `D:\data\app.db`). The directory must exist; the file is created on first write unless read-only.

## AI / tool use

This node is enabled as an **AI tool** (`usableAsTool`), with two safeguards so an agent can't destroy data:

- **Read-only** toggle — opens the database read-only; the SQLite engine itself rejects every write. **Recommended when exposing the node to an AI agent that should only query.**
- **Confirm Destructive Operation** toggle — `DROP`, `TRUNCATE`, and `DELETE`/`UPDATE` without a `WHERE` clause are blocked unless explicitly confirmed. Leave OFF for AI agents.

> When `Read-only` is OFF, **Execute Query** can run arbitrary SQL. Do not expose the node to an AI agent without `Read-only` ON.

## Compatibility

- n8n: self-hosted, recent versions (tested against the 1.x/2.x community node toolchain).
- Node.js: any version supported by your n8n install; no native build required.
- Concurrency: access to a given `.db` is serialized (journal mode, no WAL). Don't point the node at a database file another process is writing concurrently.

## Usage

1. Create a **SQLite API** credential with the absolute path to your database file.
2. Add the **SQLite** node, pick a resource/operation.
3. For agent/AI use, enable **Read-only**.

Ready-to-import example workflows (Insert & Read, Upsert sync, Safe parameterized query) live in [`examples/`](examples/).

## License

[MIT](LICENSE.md)
