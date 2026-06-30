---
task: build-order-by-clause
intent: Construir una clausula ORDER BY con direcciones en whitelist desde terminos.
target: D:/Repo/sqlite node/n8n-nodes-sqlite3-wasm/nodes/Sqlite/helpers/queryBuilder.ts
target_line: 126
language: typescript
signature: "buildOrderByClause(orderBy: OrderByClause[]): string"
tests: D:/Repo/sqlite node/n8n-nodes-sqlite3-wasm/nodes/Sqlite/helpers/__tests__/buildOrderByClause.test.ts
test_command: node ../../../node_modules/jest/bin/jest.js --config ../../../jest.config.js --runTestsByPath __tests__/buildOrderByClause.test.ts
deps_allowed:
  - ./normalize
forbids:
  - no aceptar direcciones fuera de ASC/DESC
  - no mutar el input
  - no interpolar valores
budget:
  cyclomatic: 5
  nesting: 3
  params: 1
  lines: 15
---

## Intent

Dada una lista de terminos `{ column, direction }`, devolver `ORDER BY "col" DIR, ...` o `''` si la lista esta vacia. La direccion se uppercasea y se valida contra `{ASC, DESC}`; cualquier otra cosa lanza. Los identificadores se escapan via `escapeSqlIdentifier`.

## Interface

Entrada: `orderBy: OrderByClause[]`.
Salida: `string`, la clausula `ORDER BY ...` o `''`.

## Invariants

- Direccion case-insensitive, whitelist ASC/DESC; fuera -> throw.
- Identificadores escapados.
- `[]` -> `''`.
- Terminos unidos con `, `.

## Examples

- `buildOrderByClause([])` -> `''`
- `buildOrderByClause([{column:'id',direction:'ASC'}])` -> `'ORDER BY "id" ASC'`
- `buildOrderByClause([{column:'a',direction:'desc'},{column:'b',direction:'ASC'}])` -> `'ORDER BY "a" DESC, "b" ASC'`
- `buildOrderByClause([{column:'a',direction:'SIDEWAYS'}])` -> throw

## Do / Don't

- DO: uppercasear la direccion antes de validar.
- DON'T: aceptar direcciones arbitrarias.
- DON'T: mutar el input.

## Tests

Tests congelados en `nodes/Sqlite/helpers/__tests__/buildOrderByClause.test.ts`. Oraculo independiente: ``ORDER BY ${orderBy.map(i => esc(i.column) + ' ' + i.direction.toUpperCase()).join(', ')}`` o `''`. Cubre unico, multiple, lowercase, escapado, vacio, direccion invalida throw.

## Constraints

- Budget: cyclomatic <= 5, nesting <= 3, params <= 1, lines <= 15.
- PARAR y reportar si: una direccion fuera de whitelist pasa.