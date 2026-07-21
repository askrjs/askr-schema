# @askrjs/schema

[![CI](https://github.com/askrjs/askr-schema/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/askrjs/askr-schema/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/%40askrjs%2Fschema.svg)](https://www.npmjs.com/package/@askrjs/schema)

Executable, TypeScript-first schemas with deterministic OpenAPI 3.1 projection.
The same declaration validates runtime input through `safeParse()` and exposes
its deeply immutable documentation shape through `openapi`.

```ts
import { schema, type InferSchema } from "@askrjs/schema";

const User = schema.object({
  id: schema.uuid(),
  name: schema.string({ minLength: 1 }),
  nickname: schema.optional(schema.string()),
});

type User = InferSchema<typeof User>;
const result = User.safeParse({ id: crypto.randomUUID(), name: "Ada" });
```

Validation failures contain stable path arrays, codes, and messages. Objects
reject undeclared keys by default; opt into additional keys with
`additionalProperties: true` or validate them with another schema.

`schema.object()` and `schema.record()` return `ObjectSchema`, the transport-safe
schema subtype used by action inputs, route search, and server operation inputs.
String formats are limited to the formats the runtime implements. Use
`schema.raw()` when an integration intentionally owns a custom format.

`schema.raw(openapi, safeParse)` is the explicit extension seam. It requires an
executable parser so a documentation-only declaration cannot masquerade as a
runtime schema. Named component references are created by `@askrjs/server`
while retaining the original schema parser.

See [docs/schema.md](docs/schema.md) for the complete built-in vocabulary and
projection guarantees.

## Development

```sh
npm ci
npm run check
npm run pack:check
```

The package uses Vite Plus and publishes only ESM JavaScript and declarations
from `dist/`.
