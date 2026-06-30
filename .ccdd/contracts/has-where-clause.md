---
task: has-where-clause
intent: Detectar si una sentencia SQL lleva clausula WHERE (presencia del keyword top-level).
target: D:/Repo/sqlite node/n8n-nodes-sqlite3-wasm/nodes/Sqlite/helpers/security.ts
target_line: 45
language: typescript
signature: "hasWhereClause(sql: string): boolean"
tests: D:/Repo/sqlite node/n8n-nodes-sqlite3-wasm/nodes/Sqlite/helpers/__tests__/hasWhereClause.test.ts
test_command: node ../../../node_modules/jest/bin/jest.js --config ../../../jest.config.js --runTestsByPath __tests__/hasWhereClause.test.ts
deps_allowed: []
forbids:
  - no ejecutar SQL
  - no mutar el input
  - no matchear WHERE como substring de otra palabra
budget:
  cyclomatic: 3
  nesting: 1
  params: 1
  lines: 4
---

## Intent

Dado un SQL, devolver `true` si contiene el keyword `WHERE` (case-insensitive, word-boundary); `false` en caso contrario. Lo usa `isDestructiveOperation` para distinguir un DELETE/UPDATE con alcance (tiene WHERE) de uno full-table (sin WHERE).

## Interface

Entrada: `sql: string`.
Salida: `boolean`.

## Invariants

- Case-insensitive (`Where`, `wHeRe` matchean).
- Word-boundary: `wherever` y `nowhere` NO matchean (la `_`/letras son word chars, no hay boundary).
- `''` -> `false`.
- Nunca lanza; nunca muta el input.

## Examples

- `hasWhereClause("SELECT * FROM t WHERE id = 1")` -> `true`
- `hasWhereClause("DELETE FROM t")` -> `false`
- `hasWhereClause("select * from t where x")` -> `true`
- `hasWhereClause("WHERE")` -> `true`
- `hasWhereClause("wherever")` -> `false`

## Do / Don't

- DO: regex `\bWHERE\b` case-insensitive.
- DON'T: matchear WHERE dentro de otra palabra.
- DON'T: parsear SQL completo; solo presencia del keyword.

## Tests

Tests congelados en `nodes/Sqlite/helpers/__tests__/hasWhereClause.test.ts`. Oraculo independiente: `/\bWHERE\b/i.test(sql)`. Cubre WHERE presente/ausente, case-insensitive, no-substring (`wherever`/`nowhere`), escapado de identificadores, vacio, keyword solo.

## Constraints

- Budget: cyclomatic <= 3, nesting <= 1, params <= 1, lines <= 4.
- PARAR y reportar si: WHERE dentro de otra palabra llega a matchear.