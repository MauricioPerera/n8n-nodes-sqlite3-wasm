# Changelog

## 1.0.0

Initial release.

- SQLite node backed by `node-sqlite3-wasm` (pure WebAssembly, no native binary — runs on any OS/Node where n8n runs).
- Operations: Select, Insert, Update, Delete, Upsert (Create or Update), Execute Query.
- Parameterized values, escaped identifiers, normalization of booleans / `undefined` / big integers.
- AI tool support (`usableAsTool`) with safeguards: **Read-only** mode (engine-level write protection) and **Confirm Destructive Operation** guard (blocks DROP/TRUNCATE and DELETE/UPDATE without WHERE).
- Self-hosted only (reads/writes a local SQLite file; not for n8n Cloud).
