# Schema language

Every declaration has two inseparable surfaces:

- `safeParse(value)` returns typed data or immutable, path-addressable issues.
- `openapi` is a deeply frozen, deterministically ordered JSON Schema object.

Built-ins include strings and common formats, finite numbers and integers,
booleans, null, strict objects, arrays, records, enums, literals, optional and
nullable values, and `oneOf` / `anyOf` / `allOf` composition.

Constraints written into a built-in schema are executable. This includes
string length, pattern and supported formats; numeric bounds and multiples;
array size and uniqueness; and object size and additional-property schemas.

`schema.raw(projection, safeParse)` supports specialized formats while keeping
the executable-schema invariant. The callback must return a `SafeParseResult`.
There is intentionally no projection-only reference declaration.
