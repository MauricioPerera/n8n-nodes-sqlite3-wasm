---
task: normalize-row
intent: Convertir los bigint de una fila a tipos JSON-serializables.
target: D:/Repo/sqlite node/n8n-nodes-sqlite3-wasm/nodes/Sqlite/helpers/normalize.ts
target_line: 51
language: typescript
signature: "normalizeRow(row: Record<string, unknown>): Record<string, unknown>"
tests: D:/Repo/sqlite node/n8n-nodes-sqlite3-wasm/nodes/Sqlite/helpers/__tests__/normalizeRow.test.ts
test_command: node ../../../node_modules/jest/bin/jest.js --config ../../../jest.config.js --runTestsByPath __tests__/normalizeRow.test.ts
deps_allowed: []
forbids:
  - no mutar la fila de entrada
  - no alterar valores no-bigint
budget:
  cyclomatic: 5
  nesting: 3
  params: 2
  lines: 20
---

## Intent

Devolver una copia de la fila donde todo `bigint` es JSON-serializable, para que `JSON.stringify` nunca lance `Do not know how to serialize a BigInt`.

## Interface

Entrada: `row: Record<string, unknown>`.
Salida: `Record<string, unknown>`, nueva fila con bigints normalizados.

## Invariants

- Para cada valor `bigint`: si `Number.isSafeInteger(Number(v))` -> `number`, si no -> `string` (`String(v)`).
- Los valores que no son `bigint` se copian sin cambios.
- No muta la fila de entrada.
- El resultado siempre es serializable por `JSON.stringify` (ningun `bigint` queda).

## Examples

- `normalizeRow({id: 5n})` -> `{id: 5}` (number)
- `normalizeRow({id: 9007199254740993n})` -> `{id: "9007199254740993"}` (string)
- `normalizeRow({a: "x", b: 1, c: null})` -> `{a: "x", b: 1, c: null}`

## Do / Don't

- DO: construir un objeto nuevo clave por clave.
- DO: usar `Number.isSafeInteger(Number(v))` para decidir number vs string.
- DON'T: mutar la fila de entrada.
- DON'T: tocar valores que no son bigint.

## Tests

Tests congelados en `nodes/Sqlite/helpers/__tests__/normalizeRow.test.ts`. Oraculo independiente por valor. Verifica bigint seguro->number, bigint grande->string, no-bigint intacto, no-mutacion, y `JSON.stringify` no lanza.

## Constraints

- Budget: cyclomatic <= 5, nesting <= 3, params <= 2, lines <= 20.
- PARAR y reportar si: queda algun bigint en el output, o la fila original fue mutada.