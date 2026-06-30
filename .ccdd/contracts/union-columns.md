---
task: union-columns
intent: Calcular la union de claves de varias filas en orden de primera aparicion.
target: D:/Repo/sqlite node/n8n-nodes-sqlite3-wasm/nodes/Sqlite/helpers/queryBuilder.ts
target_line: 53
language: typescript
signature: "unionColumns(rows: Record<string, unknown>[]): string[]"
tests: D:/Repo/sqlite node/n8n-nodes-sqlite3-wasm/nodes/Sqlite/helpers/__tests__/unionColumns.test.ts
test_command: node ../../../node_modules/jest/bin/jest.js --config ../../../jest.config.js --runTestsByPath __tests__/unionColumns.test.ts
deps_allowed: []
forbids:
  - no ordenar alfabeticamente
  - no mutar las filas
  - no incluir duplicados
budget:
  cyclomatic: 5
  nesting: 3
  params: 1
  lines: 15
---

## Intent

Dada una lista de filas heterogeneas, devolver la lista de columnas union en el orden en que cada clave aparece por primera vez. Es la base del fix A2: cuando insert no recibe columnas explicitas, alinea todas las filas a esta union.

## Interface

Entrada: `rows: Record<string, unknown>[]`.
Salida: `string[]`, claves union en orden de primera aparicion.

## Invariants

- Orden = primera aparicion recorriendo filas en orden y claves en orden de `Object.keys`.
- Sin duplicados.
- `[]` -> `[]`; filas sin claves propias -> `[]`.
- No muta las filas de entrada.

## Examples

- `unionColumns([{a:1,b:2},{b:3,c:4}])` -> `['a','b','c']`
- `unionColumns([{z:1,a:2}])` -> `['z','a']` (no ordenado)
- `unionColumns([])` -> `[]`

## Do / Don't

- DO: usar `Object.keys` y un Set de vistos.
- DON'T: ordenar las claves.
- DON'T: mutar el input.

## Tests

Tests congelados en `nodes/Sqlite/helpers/__tests__/unionColumns.test.ts`. Oraculo independiente: recorre filas y claves, push si no visto. Cubre heterogeneas (A2), orden primera-aparicion, deduplicacion, vacio, sin claves, no-mutacion.

## Constraints

- Budget: cyclomatic <= 5, nesting <= 3, params <= 1, lines <= 15.
- PARAR y reportar si: el orden deja de ser de primera aparicion.