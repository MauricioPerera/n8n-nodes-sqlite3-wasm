---
task: align-rows-to-columns
intent: Proyectar cada fila sobre una lista de columnas en orden rellenando null en ausentes.
target: D:/Repo/sqlite node/n8n-nodes-sqlite3-wasm/nodes/Sqlite/helpers/queryBuilder.ts
target_line: 73
language: typescript
signature: "alignRowsToColumns(rows: Record<string, unknown>[], columns: string[]): unknown[][]"
tests: D:/Repo/sqlite node/n8n-nodes-sqlite3-wasm/nodes/Sqlite/helpers/__tests__/alignRowsToColumns.test.ts
test_command: node ../../../node_modules/jest/bin/jest.js --config ../../../jest.config.js --runTestsByPath __tests__/alignRowsToColumns.test.ts
deps_allowed: []
forbids:
  - no usar el orden de keys de la fila
  - no omitir columnas ausentes (deben ser null)
  - no normalizar valores
  - no mutar las filas
budget:
  cyclomatic: 4
  nesting: 3
  params: 2
  lines: 15
---

## Intent

Para cada fila, devolver un array de valores en el orden exacto de `columns`; la columna ausente -> `null` (fix A2). Garantiza que columna y valor estan alineados por posicion (fix A3). Los valores se devuelven crudos; la normalizacion para bind es responsabilidad del llamador.

## Interface

Entrada: `rows: Record<string, unknown>[]`, `columns: string[]`.
Salida: `unknown[][]`, una fila de valores por fila de entrada.

## Invariants

- Cada fila de salida tiene exactamente `columns.length` elementos, en el orden de `columns`.
- Columna presente (via `hasOwnProperty`) -> su valor crudo (incluido `null` explicito).
- Columna ausente -> `null`.
- Claves extra de la fila no presentes en `columns` -> ignoradas.
- `[]` filas -> `[]`; `columns = []` -> un array vacio por fila.
- No muta las filas; no normaliza (boolean/bigint pasan crudos).

## Examples

- `alignRowsToColumns([{a:1,b:2},{a:3}], ['a','b','c'])` -> `[[1,2,null],[3,null,null]]`
- `alignRowsToColumns([{c:5,b:2,a:1}], ['a','b','c'])` -> `[[1,2,5]]` (orden columnas, no keys)
- `alignRowsToColumns([{a:null}], ['a'])` -> `[[null]]` (null explicito = presente)

## Do / Don't

- DO: usar `Object.prototype.hasOwnProperty.call` para distinguir ausente de null.
- DON'T: usar `Object.values` (rompe el orden y el alineamiento A3).
- DON'T: normalizar valores aqui.
- DON'T: mutar el input.

## Tests

Tests congelados en `nodes/Sqlite/helpers/__tests__/alignRowsToColumns.test.ts`. Oraculo independiente: `rows.map(row => columns.map(col => hasOwn(row,col) ? row[col] : null))`. Cubre heterogeneas (A2 null), orden columnas vs keys (A3), claves extra, null explicito, vacios, tipos crudos, no-mutacion.

## Constraints

- Budget: cyclomatic <= 4, nesting <= 3, params <= 2, lines <= 15.
- PARAR y reportar si: el orden deja de ser el de `columns` o un ausente deja de ser null.