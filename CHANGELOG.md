# Changelog

## 1.1.0

- **Multiple databases per credential.** New optional **Base Directory** on the credential plus a **Database** field on the node lets one credential serve many .db files (resolved inside the base directory, sandboxed against path traversal). Also a **Database File Path Override** for a full absolute path. Backward compatible: a credential with just a Database File Path works unchanged.

## 1.0.1

- Exclude `tsconfig.tsbuildinfo` from the published package (redirect TS incremental build info out of `dist`). No functional changes.

## 1.0.0

Initial release.

- SQLite node backed by `node-sqlite3-wasm` (pure WebAssembly, no native binary — runs on any OS/Node where n8n runs).
- Operations: Select, Insert, Update, Delete, Upsert (Create or Update), Execute Query.
- Parameterized values, escaped identifiers, normalization of booleans / `undefined` / big integers.
- AI tool support (`usableAsTool`) with safeguards: **Read-only** mode (engine-level write protection) and **Confirm Destructive Operation** guard (blocks DROP/TRUNCATE and DELETE/UPDATE without WHERE).
- Self-hosted only (reads/writes a local SQLite file; not for n8n Cloud).
