---
task: escape-sql-identifier
intent: Escapar un identificador SQLite envuelto en comillas dobles con comillas internas duplicadas.
target: D:/Repo/sqlite node/n8n-nodes-sqlite3-wasm/nodes/Sqlite/helpers/normalize.ts
target_line: 15
language: typescript
signature: "escapeSqlIdentifier(identifier: string): string"
tests: D:/Repo/sqlite node/n8n-nodes-sqlite3-wasm/nodes/Sqlite/helpers/__tests__/escapeSqlIdentifier.test.ts
test_command: node ../../../node_modules/jest/bin/jest.js --config ../../../jest.config.js --runTestsByPath __tests__/escapeSqlIdentifier.test.ts
deps_allowed: []
forbids:
  - no escapar comillas simples
  - no mutar el input
budget:
  cyclomatic: 5
  nesting: 3
  params: 2
  lines: 20
---

## Intent

Dado un nombre de columna o tabla, devolver su forma segura como identificador SQLite: envuelto en comillas dobles, con cada comilla doble interna reemplazada por dos comillas dobles.

## Interface

Entrada: `identifier: string`.
Salida: `string`, siempre envuelta en comillas dobles.

## Invariants

- El resultado siempre comienza y termina con `"`.
- Toda `"` del input aparece duplicada como `""` en el output.
- Para input sin comillas: `'"' + input + '"'`.
- No lanza para ningun string finito (incluido el vacio y un string de solo comillas).

## Examples

- `escapeSqlIdentifier("name")` -> `"\"name\""`
- `escapeSqlIdentifier("na\"me")` -> `"\"na\"\"me\""`
- `escapeSqlIdentifier("")` -> `"\"\""`
- `escapeSqlIdentifier("\"")` -> `"\"\"\"\""`

## Do / Don't

- DO: reemplazo global de `"` por `""`.
- DON'T: escapar comillas simples.
- DON'T: alterar espacios o el caso del input.

## Tests

Tests congelados en `nodes/Sqlite/helpers/__tests__/escapeSqlIdentifier.test.ts`. Oraculo independiente: `'"' + s.replace(/"/g, '""') + '"'`. Verifica envoltura, duplicacion, conteo de comillas `2 + 2*n`, casos frontera (vacio, solo comillas) e inyectividad.

## Constraints

- Budget: cyclomatic <= 5, nesting <= 3, params <= 2, lines <= 20.
- PARAR y reportar si: el identificador no es string finito, o el escape deja de ser inyectivo respecto al round-trip con un unparser trivial.