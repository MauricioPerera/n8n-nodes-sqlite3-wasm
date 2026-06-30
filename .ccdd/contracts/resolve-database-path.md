---
task: resolve-database-path
intent: Resolver el path absoluto del archivo SQLite para un item segun precedencia override, database+baseDirectory, credentialDatabasePath.
target: D:/Repo/sqlite node/n8n-nodes-sqlite3-wasm/nodes/Sqlite/helpers/resolvePath.ts
target_line: 43
language: typescript
signature: "resolveDatabasePath(opts: ResolveDatabasePathOptions): string"
tests: D:/Repo/sqlite node/n8n-nodes-sqlite3-wasm/nodes/Sqlite/helpers/__tests__/resolveDatabasePath.test.ts
test_command: node ../../../node_modules/jest/bin/jest.js --config ../../../jest.config.js --runTestsByPath __tests__/resolveDatabasePath.test.ts
deps_allowed:
  - node:path
forbids:
  - no acceder al filesystem
  - no mutar el input
  - no aceptar un override relativo
  - no aceptar database sin baseDirectory
  - no aceptar database que resuelva fuera de baseDirectory
  - no devolver un path no absoluto
budget:
  cyclomatic: 10
  nesting: 3
  params: 1
  lines: 30
---

## Intent

Dado `{ credentialDatabasePath?, baseDirectory?, database?, override? }`, devolver el path absoluto del archivo SQLite que el router debe abrir para un item. Primer-gana: `override` absoluto; si no, `database` dentro de `baseDirectory` (sandbox); si no, `credentialDatabasePath` absoluto (retrocompat); si no, lanzar.

## Interface

Entrada: `opts: ResolveDatabasePathOptions` (todos opcionales, strings).
Salida: `string` (path absoluto).
Lanza: `Error` con mensaje claro en cada malconfig.

## Invariants

- `override` no vacio -> exige `path.isAbsolute(override)`; si no, lanza `databasePathOverride must be an absolute path`. Devuelve `override`.
- `override` vacio/undefined -> se ignora (cae al siguiente).
- `database` no vacio -> exige `baseDirectory` no vacio; si no, lanza `Database field requires a Base Directory in the credential`.
- exige `path.isAbsolute(baseDirectory)`; si no, lanza `baseDirectory must be an absolute path`.
- `resolved = path.resolve(path.resolve(baseDirectory), database)`. Containment: `resolved === normalizedBase` O `resolved.startsWith(normalizedBase + path.sep)`. Si no, lanza `resolved path escapes the base directory`. Devuelve `resolved`.
- `database` absoluto fuera del base -> el containment lo rechaza (escape).
- `database` vacio -> se ignora.
- `credentialDatabasePath` no vacio -> exige `path.isAbsolute`; si no, lanza `databasePath must be an absolute path`. Devuelve el valor.
- Nada configurado -> lanza `no database configured: set Database File Path, or Base Directory + Database`.
- El path devuelto es SIEMPRE absoluto.
- Pura: sin filesystem, sin side effects, sin mutar input.

## Examples

- `resolveDatabasePath({ override: "/data/x.db" })` -> `/data/x.db`
- `resolveDatabasePath({ override: "rel.db" })` -> throw (absolute required)
- `resolveDatabasePath({ baseDirectory: "/base", database: "a.db" })` -> `/base/a.db`
- `resolveDatabasePath({ baseDirectory: "/base", database: "sub/app.db" })` -> `/base/sub/app.db`
- `resolveDatabasePath({ baseDirectory: "/base", database: "../escape.db" })` -> throw (escapes)
- `resolveDatabasePath({ baseDirectory: "/base", database: "/etc/x" })` -> throw (escapes)
- `resolveDatabasePath({ database: "a.db" })` -> throw (requires a Base Directory)
- `resolveDatabasePath({ baseDirectory: "rel", database: "a.db" })` -> throw (base must be absolute)
- `resolveDatabasePath({ credentialDatabasePath: "/data/legacy.db" })` -> `/data/legacy.db`
- `resolveDatabasePath({})` -> throw (no database configured)
- `resolveDatabasePath({ override: "/o.db", baseDirectory: "/b", database: "a.db", credentialDatabasePath: "/c.db" })` -> `/o.db` (override wins)

## Do / Don't

- DO: normalizar ambos lados con `path.resolve` antes del containment.
- DO: usar `base + path.sep` (no `startsWith(base)` solo) para no aceptar un sibling con prefijo compartido.
- DON'T: acceder al filesystem; esto es logica de path pura.
- DON'T: devolver un path relativo.
- DON'T: aceptar `database` sin `baseDirectory`.

## Tests

Tests congelados en `nodes/Sqlite/helpers/__tests__/resolveDatabasePath.test.ts`. Oraculo independiente que rederiva la spec con `node:path` (no llama al target). Cubre: override absoluto OK, override relativo lanza, override vacio cae al siguiente, database+base resuelve dentro (plano y anidado), `../escape.db` lanza, `../../escape.db` lanza, database absoluto fuera del base lanza, database sin baseDirectory lanza, baseDirectory relativo lanza, solo credentialDatabasePath absoluto OK (retrocompat), credentialDatabasePath relativo lanza, nada configurado lanza, override precede a database+credential, database precede a credential, sibling con prefijo compartido (`../<sibling-prefix>/x.db`) rechazado por el sep guard.

## Constraints

- Budget: cyclomatic <= 10, nesting <= 3, params <= 1, lines <= 30.
- PARAR y reportar si: un `database` con `..` que escapa devuelve un path en vez de lanzar, o un path no absoluto es devuelto.