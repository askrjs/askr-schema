import { describe, expect, it } from "vitest";
import { schema, type InferSchema } from "./index";

describe("schema", () => {
  it("rejects unsupported string formats at construction", () => {
    expect(() => schema.string({ format: "hostname" as "uuid" })).toThrow(
      "Unsupported string format: hostname. Use schema.raw() for custom formats.",
    );
  });

  it("marks object and record schemas as transport-safe object schemas", () => {
    expect(schema.object({ value: schema.string() }).kind).toBe("object");
    expect(schema.record(schema.string()).kind).toBe("object");
    expect("kind" in schema.string()).toBe(false);
  });

  it("returns stable, path-addressable validation issues", () => {
    const value = schema.object({ profile: schema.object({ name: schema.string({ minLength: 2 }) }) });
    expect(value.safeParse({ profile: { name: "x" } })).toEqual({
      success: false,
      issues: [{ path: ["profile", "name"], code: "too_small", message: "Expected at least 2 characters." }],
    });
  });

  it("keeps deterministic OpenAPI projections deeply immutable", () => {
    const examples = [{ z: 1, a: ["one"] }];
    const value = schema.object({
      name: schema.string({ examples }),
      tags: schema.array(schema.string()),
    });

    expect(Object.keys(value.openapi)).toEqual([
      "additionalProperties",
      "properties",
      "required",
      "type",
    ]);
    expect(Object.isFrozen(value.openapi)).toBe(true);
    expect(Object.isFrozen(value.openapi.properties)).toBe(true);
    examples[0]!.a.push("two");
    expect(value.openapi).toMatchObject({
      properties: { name: { examples: [{ a: ["one"], z: 1 }] } },
    });
  });

  it("executes documented string number array and object constraints", () => {
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

  it("validates optional and schema-backed additional properties", () => {
    const value = schema.object({ name: schema.string(), age: schema.optional(schema.integer()) }, {
      additionalProperties: schema.boolean(),
    });
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

  it("requires raw projections to remain executable", () => {
    const value = schema.raw<number>({ type: "integer" }, (input) =>
      Number.isInteger(input)
        ? { success: true, data: input as number }
        : { success: false, issues: [{ path: [], code: "invalid_type", message: "Expected integer." }] });
    expect(value.safeParse(1)).toEqual({ success: true, data: 1 });
    expect(value.safeParse("1")).toMatchObject({ success: false });
  });

  it("executes strict object intersections as one composed contract", () => {
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
});
