---
task: prepare-replacements
intent: Convertir placeholders $N (1-indexados) en ? recolectando sus valores en orden de aparicion.
target: D:/Repo/sqlite node/n8n-nodes-sqlite3-wasm/nodes/Sqlite/helpers/queryBuilder.ts
target_line: 147
language: typescript
signature: "prepareReplacements(query: string, replacements: unknown[]): { sql: string; values: unknown[] }"
tests: D:/Repo/sqlite node/n8n-nodes-sqlite3-wasm/nodes/Sqlite/helpers/__tests__/prepareReplacements.test.ts
test_command: node ../../../node_modules/jest/bin/jest.js --config ../../../jest.config.js --runTestsByPath __tests__/prepareReplacements.test.ts
deps_allowed: []
forbids:
  - no interpolar texto crudo de expresiones en el SQL
  - no aceptar $N fuera de rango
  - no normalizar valores
  - no mutar el input
budget:
  cyclomatic: 4
  nesting: 3
  params: 2
  lines: 18
---

## Intent

Camino seguro de executeQuery (fix A6): dada una query con placeholders 1-indexados `$1, $2, ...` y un array de reemplazos, devolver la query con `?` posicionales y el array de valores en el orden en que aparecen los placeholders. `$N` fuera de rango lanza. Un `$` no seguido de digitos se deja intacto. Los valores se devuelven crudos (la normalizacion para bind la hace el llamador).

## Interface

Entrada: `query: string`, `replacements: unknown[]`.
Salida: `{ sql: string; values: unknown[] }`.

## Invariants

- Solo `$<digitos>` se convierte en `?`.
- `$N` -> `replacements[N-1]`; si `N-1 < 0` o `>= replacements.length` -> throw.
- `values` respeta el orden de aparicion de los placeholders en la query (no el orden numerico).
- `$` no numerico (p.ej. `$abc`) se deja intacto.
- Valores crudos (sin normalizar): `true`, `undefined` pasan como estan.
- No muta el input.

## Examples

- `prepareReplacements('SELECT 1', [1])` -> `{ sql: 'SELECT 1', values: [] }`
- `prepareReplacements('SELECT * FROM t WHERE id = $1', [42])` -> `{ sql: 'SELECT * FROM t WHERE id = ?', values: [42] }`
- `prepareReplacements('SELECT $2, $1', ['a','b'])` -> `{ sql: 'SELECT ?, ?', values: ['b','a'] }`
- `prepareReplacements('SELECT $3', [1,2])` -> throw
- `prepareReplacements('SELECT $0', [])` -> throw

## Do / Don't

- DO: usar `/\$(\d+)/g` con un callback que valide rango.
- DON'T: interpolar el valor del reemplazo en el SQL (siempre `?`).
- DON'T: normalizar valores aqui.

## Tests

Tests congelados en `nodes/Sqlite/helpers/__tests__/prepareReplacements.test.ts`. Oraculo independiente: mismo reemplazo regex con validacion de rango. Cubre sin placeholders, $1, multiples en orden, fuera de orden, $0 throw, fuera de rango throw, `$` no numerico intacto, valores crudos.

## Constraints

- Budget: cyclomatic <= 4, nesting <= 3, params <= 2, lines <= 18.
- PARAR y reportar si: un `$N` fuera de rango pasa sin throw o un valor se interpola en el SQL.