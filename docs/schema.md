# Schema language

Every declaration has two inseparable surfaces:

- `safeParse(value)` returns typed data or immutable, path-addressable issues.
- `openapi` is a deeply frozen, deterministically ordered JSON Schema object.

Built-ins include strings and common formats, finite numbers and integers,
booleans, null, strict objects, arrays, records, enums, literals, optional and
nullable values, and `oneOf` / `anyOf` / `allOf` composition.

`optional(nullable(value))` and `nullable(optional(value))` both produce an
optional object property that accepts `null`; modifier order does not discard
optionality. `allOf` composes the recognized keys of strict object members and
rejects keys recognized by none of them. Its draft 2020-12 projection uses
`unevaluatedProperties: false` so standards-compliant validators enforce the
same contract as `safeParse()`.

Constraints written into a built-in schema are executable. This includes
string length, pattern and supported formats; numeric bounds and multiples;
array size and uniqueness; and object size and additional-property schemas.

`schema.raw(projection, safeParse)` supports specialized formats while keeping
the executable-schema invariant. The callback must return a `SafeParseResult`.
There is intentionally no projection-only reference declaration.
