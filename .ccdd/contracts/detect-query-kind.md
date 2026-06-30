---
task: detect-query-kind
intent: Clasificar una sentencia SQL como devolvedora de filas o de cambios segun su primer token.
target: D:/Repo/sqlite node/n8n-nodes-sqlite3-wasm/nodes/Sqlite/helpers/queryBuilder.ts
target_line: 39
language: typescript
signature: "detectQueryKind(sql: string): 'rows' | 'changes'"
tests: D:/Repo/sqlite node/n8n-nodes-sqlite3-wasm/nodes/Sqlite/helpers/__tests__/detectQueryKind.test.ts
test_command: node ../../../node_modules/jest/bin/jest.js --config ../../../jest.config.js --runTestsByPath __tests__/detectQueryKind.test.ts
deps_allowed: []
forbids:
  - no ejecutar SQL
  - no mutar el input
  - no clasificar INSERT/UPDATE/DELETE/CREATE/DROP como rows
budget:
  cyclomatic: 6
  nesting: 3
  params: 1
  lines: 12
---

## Intent

Dada una sentencia SQL, devolver `'rows'` si el primer token (tras trim y upper) es SELECT, WITH, PRAGMA, EXPLAIN o VALUES (usar `db.all`); en caso contrario `'changes'` (usar `db.run`). El router usa esto para elegir el metodo de ejecucion sin inspeccionar ad-hoc.

## Interface

Entrada: `sql: string`.
Salida: `'rows' | 'changes'`.

## Invariants

- Insensible a espacios/tabs/newlines iniciales y al casing del primer token.
- `''` y strings de solo espacios -> `'changes'`.
- Nunca lanza para un string finito.
- No ejecuta ni valida SQL; solo inspecciona el prefijo.

## Examples

- `detectQueryKind("SELECT * FROM t")` -> `'rows'`
- `detectQueryKind("  with x as (...) select * from x")` -> `'rows'`
- `detectQueryKind("PRAGMA table_info(t)")` -> `'rows'`
- `detectQueryKind("INSERT INTO t VALUES (1)")` -> `'changes'`
- `detectQueryKind("")` -> `'changes'`

## Do / Don't

- DO: trimStart + toUpperCase antes de comparar prefijos.
- DON'T: requerir SQL valido; solo se mira el primer token.
- DON'T: mutar el input.

## Tests

Tests congelados en `nodes/Sqlite/helpers/__tests__/detectQueryKind.test.ts`. Oraculo independiente: `ROW_KEYWORDS.some(kw => sql.trimStart().toUpperCase().startsWith(kw)) ? 'rows' : 'changes'`. Cubre casos rows (SELECT/WITH/PRAGMA/EXPLAIN/VALUES, con espacios y casing), casos changes (INSERT/UPDATE/DELETE/CREATE/DROP, vacio, whitespace) e insensibilidad de casing.

## Constraints

- Budget: cyclomatic <= 6, nesting <= 3, params <= 1, lines <= 12.
- PARAR y reportar si: el primer token deja de ser determinable por prefijo.