import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { schema, type Schema } from "./index";

const contracts: { name: string; value: Schema; inputs: unknown[] }[] = [
  {
    name: "string",
    value: schema.string({ minLength: 1, pattern: "^a" }),
    inputs: ["a", "", "b", 1],
  },
  { name: "uuid", value: schema.uuid(), inputs: ["3d813cbb-47fb-4d3c-a584-5e0d2f0e890a", 1] },
  { name: "email", value: schema.email(), inputs: ["ada@example.test", 1] },
  { name: "uri", value: schema.uri(), inputs: ["https://example.test", 1] },
  { name: "date", value: schema.date(), inputs: ["2024-02-29", 1] },
  { name: "dateTime", value: schema.dateTime(), inputs: ["2024-02-29T00:00:00Z", 1] },
  { name: "byte", value: schema.byte(), inputs: ["YQ==", 1] },
  { name: "binary", value: schema.binary(), inputs: ["content", 1] },
  {
    name: "number",
    value: schema.number({ minimum: 1, maximum: 4, multipleOf: 2 }),
    inputs: [2, 4, 0, 3, "2"],
  },
  {
    name: "integer",
    value: schema.integer({ exclusiveMinimum: 0, exclusiveMaximum: 3 }),
    inputs: [1, 2, 0, 3, 1.5],
  },
  { name: "boolean", value: schema.boolean(), inputs: [true, false, "true"] },
  { name: "null", value: schema.null(), inputs: [null, false] },
  {
    name: "object",
    value: schema.object({ name: schema.string() }, { minProperties: 1, maxProperties: 1 }),
    inputs: [{ name: "Ada" }, {}, { name: 1 }, { name: "Ada", extra: true }],
  },
  {
    name: "array",
    value: schema.array(schema.integer(), { minItems: 1, maxItems: 2, uniqueItems: true }),
    inputs: [[1], [1, 2], [], [1, 1], [1, 2, 3], ["1"]],
  },
  {
    name: "record",
    value: schema.record(schema.boolean()),
    inputs: [{ a: true }, {}, { a: 1 }, null],
  },
  { name: "enum", value: schema.enum(["a", 1]), inputs: ["a", 1, "b", false] },
  { name: "literal", value: schema.literal("a"), inputs: ["a", "b", null] },
  { name: "optional", value: schema.optional(schema.string()), inputs: ["a", 1, null] },
  { name: "nullable", value: schema.nullable(schema.string()), inputs: ["a", null, 1] },
  { name: "oneOf", value: schema.oneOf(schema.string(), schema.number()), inputs: ["a", 1, true] },
  { name: "anyOf", value: schema.anyOf(schema.string(), schema.null()), inputs: ["a", null, true] },
  {
    name: "allOf",
    value: schema.allOf(schema.string({ minLength: 2 }), schema.string({ maxLength: 4 })),
    inputs: ["ab", "a", "abcde", 1],
  },
  {
    name: "raw",
    value: schema.raw({ type: "integer" }, (input) =>
      Number.isInteger(input)
        ? { success: true, data: input }
        : {
            success: false,
            issues: [{ path: [], code: "invalid_type", message: "Expected integer." }],
          },
    ),
    inputs: [1, 1.5, "1"],
  },
];

describe("complete schema builder projection parity", () => {
  it("should cover the exact supported builder namespace", () => {
    expect(contracts.map(({ name }) => name).sort()).toEqual(Object.keys(schema).sort());
  });

  it.each(contracts)("should agree with JSON Schema validation for $name", ({ value, inputs }) => {
    // Format algorithms are characterized separately; this matrix checks the
    // projection's type/constraint/combinator behavior on JSON-domain values.
    const validate = new Ajv2020({ strict: false, validateFormats: false }).compile(
      value.jsonSchema,
    );
    for (const input of inputs)
      expect(value.safeParse(input).success, JSON.stringify(input)).toBe(validate(input));
  });
});
