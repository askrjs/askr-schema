import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { schema } from "./index";

describe("allOf parsed output", () => {
  it.each([[], [1, 2]].map((input) => ({ input })))(
    "should preserve array output for $input",
    ({ input }) => {
      const value = schema.allOf(schema.array(schema.number()), schema.array(schema.number()));
      const result = value.safeParse(input);
      const validate = new Ajv2020({ strict: true }).compile(value.jsonSchema);

      expect(result).toEqual({ success: true, data: input });
      if (!result.success) throw new Error("Expected successful intersection");
      expect(Array.isArray(result.data)).toBe(true);
      expect(validate(result.data)).toBe(true);
      expect(result.data.map((entry) => entry + 1)).toEqual(input.map((entry) => entry + 1));
    },
  );

  it("should preserve nested and nullable array output", () => {
    const member = schema.nullable(schema.array(schema.array(schema.integer())));
    const value = schema.allOf(member, member);

    expect(value.safeParse([[1], []])).toEqual({ success: true, data: [[1], []] });
    expect(value.safeParse(null)).toEqual({ success: true, data: null });
    expect(value.safeParse([["invalid"]])).toMatchObject({
      success: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: [0, 0], code: "invalid_type" }),
      ]),
    });
  });

  it("should preserve opaque raw-parser object identity instead of spreading it", () => {
    const date = new Date("2026-10-12T00:00:00Z");
    const member = schema.raw<Date>({}, () => ({ success: true, data: date }));
    const result = schema.allOf(member, member).safeParse(date);

    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(date);
  });

  it("should continue merging plain and null-prototype records", () => {
    const left = schema.raw<{ left: number }>({}, () => ({ success: true, data: { left: 1 } }));
    const right = schema.raw<{ right: number }>({}, () => ({
      success: true,
      data: Object.assign(Object.create(null), { right: 2 }),
    }));

    expect(schema.allOf(left, right).safeParse({})).toEqual({
      success: true,
      data: { left: 1, right: 2 },
    });
  });
});

describe("multipleOf decimal precision", () => {
  it.each([
    [1_000_000_000_000_001, 10],
    [-1_000_000_000_000_001, 10],
    [Number.MAX_SAFE_INTEGER, 2],
  ])("should reject safe integer %s that is not a multiple of %s", (input, divisor) => {
    for (const value of [
      schema.number({ multipleOf: divisor }),
      schema.integer({ multipleOf: divisor }),
    ]) {
      const validate = new Ajv2020({ strict: true }).compile(value.jsonSchema);
      expect(validate(input)).toBe(false);
      expect(value.safeParse(input)).toEqual({
        success: false,
        issues: [{ path: [], code: "not_multiple", message: `Expected a multiple of ${divisor}.` }],
      });
      expect(value.safeParse(input - (input % divisor))).toMatchObject({ success: true });
    }
  });

  it.each([
    [300_000_000.3, 0.3],
    [-300_000_000.3, 0.3],
    [0.3, 0.1],
    [1e308, 1e-308],
    [0, 5e-324],
    [5e-324, 5e-324],
    [1e-323, 5e-324],
  ])("should accept canonical decimal multiple %s of %s", (input, divisor) => {
    expect(schema.number({ multipleOf: divisor }).safeParse(input)).toEqual({
      success: true,
      data: input,
    });
  });

  it.each([
    [300_000_000.35, 0.3],
    [0.30000000000000004, 0.1],
    [1e-308, 1e308],
    [1e308, 3],
  ])("should reject canonical decimal nonmultiple %s of %s", (input, divisor) => {
    expect(schema.number({ multipleOf: divisor }).safeParse(input)).toMatchObject({
      success: false,
      issues: [{ path: [], code: "not_multiple" }],
    });
  });
});
