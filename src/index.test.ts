import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { schema, type InferSchema } from "./index";

describe("schema", () => {
  it("should reject unsupported string formats at construction", () => {
    expect(() => schema.string({ format: "hostname" as "uuid" })).toThrow(
      "Unsupported string format: hostname. Use schema.raw() for custom formats.",
    );
  });

  it("should count Unicode code points at string length boundaries", () => {
    const exactlyTwo = schema.string({ minLength: 2, maxLength: 2 });

    expect(exactlyTwo.safeParse("ab")).toMatchObject({ success: true });
    expect(exactlyTwo.safeParse("a")).toMatchObject({
      success: false,
      issues: [{ code: "too_small" }],
    });
    expect(exactlyTwo.safeParse("abc")).toMatchObject({
      success: false,
      issues: [{ code: "too_big" }],
    });
    expect(exactlyTwo.safeParse("a😀")).toMatchObject({ success: true });
    expect(exactlyTwo.safeParse("😀")).toMatchObject({
      success: false,
      issues: [{ code: "too_small" }],
    });
    expect(schema.string({ maxLength: 1 }).safeParse("😀")).toMatchObject({ success: true });
    expect(exactlyTwo.safeParse("e\u0301")).toMatchObject({ success: true });
    expect(exactlyTwo.jsonSchema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      minLength: 2,
      maxLength: 2,
    });
  });

  it("should enforce RFC 3339 calendar, time, and offset boundaries for date-time", () => {
    const dateTime = schema.dateTime();
    const valid = [
      "2024-02-29T23:59:59Z",
      "2025-01-01t00:00:00z",
      "2025-01-01T00:00:00.123456789Z",
      "2025-01-01T12:30:45+14:00",
      "2025-01-01T12:30:45-05:30",
    ];
    const invalid = [
      "2025-02-29T00:00:00Z",
      "2025-02-30T00:00:00Z",
      "2025-01-01T00:00:00",
      "2025-01-01T24:00:00Z",
      "2025-01-01T00:60:00Z",
      "2025-01-01T00:00:61Z",
      "2025-01-01T00:00:00+24:00",
      "2025-01-01T00:00:00+01:60",
      "2025-01-01T00:00:00Z trailing",
    ];

    for (const value of valid) expect(dateTime.safeParse(value)).toMatchObject({ success: true });
    for (const value of invalid) {
      expect(dateTime.safeParse(value)).toMatchObject({
        success: false,
        issues: [{ code: "invalid_string", message: "Expected date-time." }],
      });
    }
    expect(dateTime.jsonSchema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "string",
      format: "date-time",
    });
  });

  it("should mark object and record schemas as transport-safe object schemas", () => {
    expect(schema.object({ value: schema.string() }).kind).toBe("object");
    expect(schema.record(schema.string()).kind).toBe("object");
    expect("kind" in schema.string()).toBe(false);
  });

  it("should not accept inherited required properties or mutate output prototypes", () => {
    const inherited = Object.create({ name: "smuggled" }) as Record<string, unknown>;
    expect(schema.object({ name: schema.string() }).safeParse(inherited)).toMatchObject({
      success: false,
      issues: [{ code: "required", path: ["name"] }],
    });

    const input = JSON.parse('{"__proto__":{"polluted":true},"safe":"value"}') as unknown;
    const result = schema.object({}, { additionalProperties: true }).safeParse(input);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const parsed = result.data as Record<string, unknown>;
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(parsed, "__proto__")).toBe(true);
    expect(parsed.__proto__).toEqual({ polluted: true });
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("should define record keys as own data properties", () => {
    const result = schema
      .record(schema.string())
      .safeParse(JSON.parse('{"__proto__":"safe","constructor":"also-safe"}'));
    expect(result.success).toBe(true);
    if (!result.success) return;
    const parsed = result.data;
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(parsed, "__proto__")?.value).toBe("safe");
    expect(Object.getOwnPropertyDescriptor(parsed, "constructor")?.value).toBe("also-safe");
  });

  it("should return stable, path-addressable validation issues", () => {
    const value = schema.object({
      profile: schema.object({ name: schema.string({ minLength: 2 }) }),
    });
    expect(value.safeParse({ profile: { name: "x" } })).toEqual({
      success: false,
      issues: [
        {
          path: ["profile", "name"],
          code: "too_small",
          message: "Expected at least 2 characters.",
        },
      ],
    });
  });

  it("should keep deterministic JSON Schema 2020-12 projections deeply immutable", () => {
    const examples = [{ z: 1, a: ["one"] }];
    const value = schema.object({
      name: schema.string({ examples }),
      tags: schema.array(schema.string()),
    });

    expect(Object.keys(value.jsonSchema)).toEqual([
      "$schema",
      "additionalProperties",
      "properties",
      "required",
      "type",
    ]);
    expect(Object.isFrozen(value.jsonSchema)).toBe(true);
    expect(Object.isFrozen(value.jsonSchema.properties)).toBe(true);
    examples[0]!.a.push("two");
    expect(value.jsonSchema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      properties: { name: { examples: [{ a: ["one"], z: 1 }] } },
    });
  });

  it("should canonicalize every order-insensitive projection array without reordering examples", () => {
    const objectPair = () =>
      [
        schema.array(schema.object({ b: schema.string(), a: schema.number() })),
        schema.array(schema.object({ a: schema.number(), b: schema.string() })),
      ] as const;
    const memberA = () => schema.object({ a: schema.string() });
    const memberB = () => schema.object({ b: schema.number() });
    const pairs = [
      ["required", ...objectPair()],
      ["enum", schema.enum(["b", "a", "c"]), schema.enum(["c", "b", "a"])],
      ["oneOf", schema.oneOf(memberA(), memberB()), schema.oneOf(memberB(), memberA())],
      ["anyOf", schema.anyOf(memberA(), memberB()), schema.anyOf(memberB(), memberA())],
      ["allOf", schema.allOf(memberA(), memberB()), schema.allOf(memberB(), memberA())],
    ] as const;

    for (const [label, left, right] of pairs) {
      expect(JSON.stringify(left.jsonSchema), label).toBe(JSON.stringify(right.jsonSchema));
    }
    expect(schema.string({ examples: ["second", "first"] }).jsonSchema.examples).toEqual([
      "second",
      "first",
    ]);
  });

  it("should execute documented string number array and object constraints", () => {
    const value = schema.object({
      id: schema.uuid(),
      score: schema.number({ exclusiveMinimum: 0, multipleOf: 0.5 }),
      tags: schema.array(schema.string(), { minItems: 2, uniqueItems: true }),
    });

    expect(value.safeParse({ id: "not-a-uuid", score: 0, tags: ["x", "x"] })).toEqual({
      success: false,
      issues: [
        { path: ["id"], code: "invalid_string", message: "Expected uuid." },
        { path: ["score"], code: "too_small", message: "Expected greater than 0." },
        { path: ["tags"], code: "not_unique", message: "Expected unique items." },
      ],
    });
  });

  it("should bound uniqueItems canonicalization and reject active-path cycles", () => {
    const anyValue = schema.raw<unknown>({}, (input) => ({ success: true, data: input }));
    const uniqueValues = schema.array(anyValue, { uniqueItems: true });
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);

    expect(() => uniqueValues.safeParse([cyclic])).not.toThrow();
    expect(uniqueValues.safeParse([cyclic])).toEqual({
      success: false,
      issues: [
        {
          path: [],
          code: "invalid_value",
          message: "Expected unique items with acyclic values no deeper than 100 levels.",
        },
      ],
    });

    let deeplyNested: Record<string, unknown> = {};
    for (let depth = 0; depth < 102; depth += 1) deeplyNested = { child: deeplyNested };
    expect(uniqueValues.safeParse([deeplyNested])).toMatchObject({
      success: false,
      issues: [{ code: "invalid_value" }],
    });
  });

  it("should allow shared references that do not form an active-path cycle", () => {
    const anyValue = schema.raw<unknown>({}, (input) => ({ success: true, data: input }));
    const shared = { value: "same" };
    expect(
      schema
        .array(anyValue, { uniqueItems: true })
        .safeParse([{ left: shared }, { right: shared }]),
    ).toMatchObject({ success: true });
  });

  it("should validate optional and schema-backed additional properties", () => {
    const value = schema.object(
      { name: schema.string(), age: schema.optional(schema.integer()) },
      {
        additionalProperties: schema.boolean(),
      },
    );
    type Value = InferSchema<typeof value>;
    const typed: Value = { name: "Ada" };
    expect(typed).toEqual({ name: "Ada" });
    expect(value.safeParse({ name: "Ada", enabled: true })).toEqual({
      success: true,
      data: { name: "Ada", enabled: true },
    });
    expect(value.safeParse({ name: "Ada", enabled: "yes" })).toMatchObject({
      success: false,
      issues: [{ path: ["enabled"], code: "invalid_type" }],
    });
  });

  it("should preserve optionality through both optional and nullable wrap orders", () => {
    const values = [
      schema.object({ value: schema.optional(schema.nullable(schema.string())) }),
      schema.object({ value: schema.nullable(schema.optional(schema.string())) }),
    ];

    for (const value of values) {
      expect(value.jsonSchema).not.toHaveProperty("required");
      expect(value.safeParse({})).toEqual({ success: true, data: {} });
      expect(value.safeParse({ value: null })).toEqual({ success: true, data: { value: null } });
      expect(value.safeParse({ value: "present" })).toEqual({
        success: true,
        data: { value: "present" },
      });
      expect(value.safeParse({ value: 1 })).toMatchObject({
        success: false,
        issues: [{ path: ["value"] }],
      });
    }
  });

  it("should require raw projections to remain executable", () => {
    const value = schema.raw<number>({ type: "integer" }, (input) =>
      Number.isInteger(input)
        ? { success: true, data: input as number }
        : {
            success: false,
            issues: [{ path: [], code: "invalid_type", message: "Expected integer." }],
          },
    );
    expect(value.safeParse(1)).toEqual({ success: true, data: 1 });
    expect(value.safeParse("1")).toMatchObject({ success: false });
  });

  it("should reject raw schemas declaring another dialect", () => {
    expect(() =>
      schema.raw({ $schema: "http://json-schema.org/draft-07/schema#" }, (input) => ({
        success: true,
        data: input,
      })),
    ).toThrow("Unsupported JSON Schema dialect");
  });

  it("should execute strict object intersections as one composed contract", () => {
    const value = schema.allOf(
      schema.object({ id: schema.string() }),
      schema.object({ active: schema.boolean() }),
    );
    expect(value.safeParse({ id: "one", active: true })).toEqual({
      success: true,
      data: { id: "one", active: true },
    });
    expect(value.safeParse({ id: "one", active: true, extra: "no" })).toMatchObject({
      success: false,
      issues: [{ path: ["extra"], code: "unrecognized_key" }],
    });
  });

  it("should keep allOf runtime results aligned with its JSON Schema projection", () => {
    const parityCases = [
      {
        value: schema.allOf(
          schema.object({ id: schema.string() }),
          schema.object({ active: schema.boolean() }),
        ),
        inputs: [
          { id: "one", active: true },
          { id: "one" },
          { active: true },
          { id: "one", active: "yes" },
          { id: "one", active: true, extra: "no" },
          null,
          [],
        ],
      },
      {
        value: schema.allOf(
          schema.object({ id: schema.string() }),
          schema.object({ active: schema.boolean() }, { additionalProperties: true }),
        ),
        inputs: [
          { id: "one", active: true },
          { id: "one", active: true, extra: "allowed" },
          { id: "one", active: "yes" },
        ],
      },
      {
        value: schema.allOf(
          schema.object({ id: schema.string() }),
          schema.object(
            { label: schema.string() },
            { additionalProperties: schema.boolean() },
          ),
        ),
        inputs: [
          { id: "one", label: "ready", extra: true },
          { id: "one", label: "ready", extra: "no" },
          { id: "one", label: 1, extra: true },
        ],
      },
      {
        value: schema.allOf(
          schema.object({ profile: schema.object({ name: schema.string() }) }),
          schema.object({ active: schema.boolean() }),
        ),
        inputs: [
          { profile: { name: "Ada" }, active: true },
          { profile: { name: "Ada", extra: "no" }, active: true },
        ],
      },
    ];

    for (const { value, inputs } of parityCases) {
      const validateProjection = new Ajv2020({ strict: true }).compile(value.jsonSchema);
      for (const input of inputs) {
        expect(value.safeParse(input).success, JSON.stringify(input)).toBe(
          validateProjection(input),
        );
      }
    }
  });
});
