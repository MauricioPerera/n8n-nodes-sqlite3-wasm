---
task: is-destructive-operation
intent: Clasificar una sentencia SQL como destructiva (DROP / TRUNCATE / DELETE o UPDATE sin WHERE).
target: D:/Repo/sqlite node/n8n-nodes-sqlite3-wasm/nodes/Sqlite/helpers/security.ts
target_line: 56
language: typescript
signature: "isDestructiveOperation(sql: string): boolean"
tests: D:/Repo/sqlite node/n8n-nodes-sqlite3-wasm/nodes/Sqlite/helpers/__tests__/isDestructiveOperation.test.ts
test_command: node ../../../node_modules/jest/bin/jest.js --config ../../../jest.config.js --runTestsByPath __tests__/isDestructiveOperation.test.ts
deps_allowed:
  - ./security
forbids:
  - no ejecutar SQL
  - no mutar el input
  - no clasificar SELECT/INSERT/CREATE como destructiva
  - no clasificar DELETE/UPDATE con WHERE como destructiva
  - no matchear DROP como substring de otro token
budget:
  cyclomatic: 8
  nesting: 2
  params: 1
  lines: 18
---

## Intent

Dado un SQL, devolver `true` si es destructiva a nivel tabla: DROP (token inicial), TRUNCATE (donde sea), o DELETE/UPDATE sin clausula WHERE (afecta todas las filas). Lo usa el router para exigir `confirmDestructive` antes de ejecutar.

## Interface

Entrada: `sql: string`.
Salida: `boolean`.

## Invariants

- Trim + uppercase del input antes de inspeccionar.
- `''` / solo espacios -> `false`.
- DROP como token inicial (== 'DROP' o empieza con 'DROP ') -> `true`.
- TRUNCATE como keyword en cualquier posicion (word-boundary) -> `true`.
- DELETE/UPDATE como token inicial SIN WHERE -> `true`; CON WHERE -> `false`.
- SELECT/INSERT/CREATE/PRAGMA/WITH -> `false`.
- DROP como substring de otro token (e.g. `drop_col`) -> `false` (no es token inicial).
- Case-insensitive en el token inicial.
- Nunca lanza; nunca muta el input.

## Examples

- `isDestructiveOperation("DROP TABLE users")` -> `true`
- `isDestructiveOperation("TRUNCATE TABLE users")` -> `true`
- `isDestructiveOperation("DELETE FROM users")` -> `true`
- `isDestructiveOperation("DELETE FROM users WHERE id = 1")` -> `false`
- `isDestructiveOperation("UPDATE users SET a = 1")` -> `true`
- `isDestructiveOperation("UPDATE users SET a = 1 WHERE id = 1")` -> `false`
- `isDestructiveOperation("SELECT * FROM users")` -> `false`
- `isDestructiveOperation("")` -> `false`

## Do / Don't

- DO: delegar la deteccion de WHERE a `hasWhereClause` (composicion gateable).
- DON'T: parsear SQL; solo keywords y presencia de WHERE.
- DON'T: clasificar DELETE/UPDATE con WHERE como destructiva.
- DON'T: matchear DROP dentro de `drop_col` (token inicial requerido).

## Tests

Tests congelados en `nodes/Sqlite/helpers/__tests__/isDestructiveOperation.test.ts`. Oraculo independiente: rederiva DROP-inicial / TRUNCATE / DELETE|UPDATE sin WHERE. Cubre DROP (table/index/view, casing, espacios), TRUNCATE (casing), DELETE/UPDATE sin WHERE (casing, escapado), DELETE/UPDATE con WHERE (no destructiva), SELECT/INSERT/CREATE/PRAGMA/WITH (no destructiva), vacio, DROP como substring (no destructiva).

## Constraints

- Budget: cyclomatic <= 8, nesting <= 2, params <= 1, lines <= 18.
- PARAR y reportar si: un DELETE/UPDATE con WHERE se clasifica destructiva, o DROP-como-substring se clasifica destructiva.