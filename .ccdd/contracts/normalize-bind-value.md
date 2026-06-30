---
task: normalize-bind-value
intent: Convertir un valor JS arbitrario en un valor bindeable por node-sqlite3-wasm.
target: D:/Repo/sqlite node/n8n-nodes-sqlite3-wasm/nodes/Sqlite/helpers/normalize.ts
target_line: 23
language: typescript
signature: "normalizeBindValue(value: unknown): string | number | bigint | Buffer | null"
tests: D:/Repo/sqlite node/n8n-nodes-sqlite3-wasm/nodes/Sqlite/helpers/__tests__/normalizeBindValue.test.ts
test_command: node ../../../node_modules/jest/bin/jest.js --config ../../../jest.config.js --runTestsByPath __tests__/normalizeBindValue.test.ts
deps_allowed: []
forbids:
  - no bindear objetos
  - no devolver undefined
  - no mutar el input
budget:
  cyclomatic: 7
  nesting: 3
  params: 2
  lines: 25
---

## Intent

Convertir un valor JS arbitrario en un valor que node-sqlite3-wasm acepta al bindear parametros, evitando el error `Unsupported type for binding: "undefined"`.

## Interface

Entrada: `value: unknown`.
Salida: `string | number | bigint | Buffer | null`.

## Invariants

- `undefined` -> `null`.
- `null` -> `null`.
- `boolean` `true` -> `1`, `false` -> `0`.
- `string`, `number`, `bigint` pasan sin cambios.
- `Buffer` y `Uint8Array` pasan sin cambios (mismo contenido).
- Objetos (plain object, array, Date, function, symbol, etc.) lanzan `Error` con mensaje claro. Nunca se bindea un objeto.
- Nunca devuelve `undefined`.

## Examples

- `normalizeBindValue(undefined)` -> `null`
- `normalizeBindValue(true)` -> `1`
- `normalizeBindValue(false)` -> `0`
- `normalizeBindValue("x")` -> `"x"`
- `normalizeBindValue(5n)` -> `5n`
- `normalizeBindValue({a:1})` -> lanza

## Do / Don't

- DO: usar `typeof` para ramificar por tipo primitivo.
- DO: aceptar `Buffer` y `Uint8Array` como blobs binarios.
- DON'T: devolver `undefined` (lanza en bind).
- DON'T: bindear objetos o arrays.

## Tests

Tests congelados en `nodes/Sqlite/helpers/__tests__/normalizeBindValue.test.ts`. Cubre undefined/null/boolean/string/number/bigint/Buffer/Uint8Array y los lanzamientos para object/array/Date/function.

## Constraints

- Budget: cyclomatic <= 7, nesting <= 3, params <= 2, lines <= 25.
- PARAR y reportar si: algun tipo aceptado lanza, o algun tipo rechazado no lanza.