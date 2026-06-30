---
task: build-where-clause
intent: Construir una clausula WHERE con placeholders para una lista de condiciones validadas.
target: D:/Repo/sqlite node/n8n-nodes-sqlite3-wasm/nodes/Sqlite/helpers/queryBuilder.ts
target_line: 95
language: typescript
signature: "buildWhereClause(conditions: WhereCondition[]): { clause: string; values: unknown[] }"
tests: D:/Repo/sqlite node/n8n-nodes-sqlite3-wasm/nodes/Sqlite/helpers/__tests__/buildWhereClause.test.ts
test_command: node ../../../node_modules/jest/bin/jest.js --config ../../../jest.config.js --runTestsByPath __tests__/buildWhereClause.test.ts
deps_allowed:
  - ./normalize
forbids:
  - no aceptar operadores fuera de la whitelist
  - no placeholder para IS NULL / IS NOT NULL
  - no permitir valor vacio para >, <, >=, <=
  - no interpolar valores en el SQL
  - no mutar el input
budget:
  cyclomatic: 10
  nesting: 3
  params: 1
  lines: 28
---

## Intent

Dada una lista de condiciones, devolver `{ clause, values }` donde `clause` es `WHERE ...` con `?` por cada operador valorado, o `''` si la lista esta vacia. Los operadores se validan contra una whitelist; `IS NULL` / `IS NOT NULL` no generan placeholder ni valor; para `>`, `<`, `>=`, `<=` se rechaza el valor vacio/whitespace antes de cualquier `Number()` (evita `Number('')===0`). Los valores se devuelven crudos.

## Interface

Entrada: `conditions: WhereCondition[]` (`{ column, operator, value }`).
Salida: `{ clause: string; values: unknown[] }`.

## Invariants

- Whitelist operadores: `=, !=, >, <, >=, <=, LIKE, IS NULL, IS NOT NULL` (case-insensitive).
- Operador fuera de whitelist -> throw.
- `IS NULL` / `IS NOT NULL` -> fragmento sin `?`, sin valor.
- Valor `''` o solo espacios para `>/< >= <=` -> throw.
- Identificadores escapados via `escapeSqlIdentifier`.
- Fragmentos unidos con ` AND `; prefijo `WHERE ` solo si hay condiciones.
- `[]` -> `{ clause: '', values: [] }`.
- Valores crudos (sin normalizar); `true` queda `true`.

## Examples

- `buildWhereClause([])` -> `{ clause: '', values: [] }`
- `buildWhereClause([{column:'id',operator:'=',value:1}])` -> `{ clause: 'WHERE "id" = ?', values: [1] }`
- `buildWhereClause([{column:'a',operator:'IS NULL',value:undefined}])` -> `{ clause: 'WHERE "a" IS NULL', values: [] }`
- `buildWhereClause([{column:'a',operator:'>',value:''}])` -> throw

## Do / Don't

- DO: rechazar valor vacio para comparaciones antes de bind.
- DON'T: interpolar el valor en el SQL (siempre `?`).
- DON'T: aceptar `<>` u operadores arbitrarios.

## Tests

Tests congelados en `nodes/Sqlite/helpers/__tests__/buildWhereClause.test.ts`. Oraculo independiente: rederiva fragmentos (`esc(col) + ' ' + op` + `?` salvo IS NULL/IS NOT NULL) y valores. Cubre operadores valorados, IS NULL/IS NOT NULL sin placeholder, LIKE, case-insensitive, escapado, vacio, valores crudos (boolean), operador invalido throw, valor vacio para comparaciones throw, vacio permitido para igualdad.

## Constraints

- Budget: cyclomatic <= 10, nesting <= 3, params <= 1, lines <= 28.
- PARAR y reportar si: un operador fuera de whitelist pasa o un valor vacio se cuela en una comparacion.