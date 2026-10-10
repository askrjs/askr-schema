import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it, vi } from "vite-plus/test";
import { schema, type Schema } from "./index";

describe("construction and resource boundaries", () => {
  it.each([
    {
      name: "string",
      setup: () => {
        const options = { minLength: 2 };
        return {
          value: schema.string(options),
          input: "abc",
          mutate: () => {
            options.minLength = 4;
          },
        };
      },
    },
    {
      name: "number",
      setup: () => {
        const options = { minimum: 0 };
        return {
          value: schema.number(options),
          input: 1,
          mutate: () => {
            options.minimum = 2;
          },
        };
      },
    },
    {
      name: "array",
      setup: () => {
        const options = { maxItems: 2 };
        return {
          value: schema.array(schema.number(), options),
          input: [1, 2],
          mutate: () => {
            options.maxItems = 1;
          },
        };
      },
    },
    {
      name: "object",
      setup: () => {
        const options = { maxProperties: 1 };
        return {
          value: schema.object({ a: schema.string() }, options),
          input: { a: "x" },
          mutate: () => {
            options.maxProperties = 0;
          },
        };
      },
    },
  ])(
    "should snapshot $name options so later mutation cannot change projection parity",
    ({ setup }) => {
      const { value, input, mutate } = setup();
      const projection = JSON.stringify(value.jsonSchema);
      const validate = new Ajv2020().compile(value.jsonSchema);
      expect(value.safeParse(input).success).toBe(true);
      mutate();
      expect(validate(input)).toBe(true);
      expect(value.safeParse(input).success).toBe(true);
      expect(JSON.stringify(value.jsonSchema)).toBe(projection);
    },
  );

  it("should snapshot enum members", () => {
    const members = ["a"];
    const enumeration = schema.enum(members);
    members.push("b");
    expect(enumeration.safeParse("b").success).toBe(false);
    expect(enumeration.jsonSchema.enum).toEqual(["a"]);
  });

  it("should snapshot object declarations", () => {
    const declarations: Record<string, Schema> = { name: schema.string() };
    const object = schema.object(declarations);
    declarations.extra = schema.number();
    expect(object.safeParse({ name: "Ada", extra: 1 })).toMatchObject({
      success: false,
      issues: [{ path: ["extra"], code: "unrecognized_key" }],
    });
  });

  it.each(["oneOf", "anyOf", "allOf"] as const)(
    "should reject empty %s definitions before emitting invalid JSON Schema",
    (name) => {
      expect(() => schema[name]()).toThrow(
        new TypeError(`schema.${name} requires at least one schema.`),
      );
      const valid = schema[name](schema.string());
      expect(new Ajv2020().compile(valid.jsonSchema)("recovered")).toBe(true);
      expect(valid.safeParse("recovered").success).toBe(true);
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "should reject non-finite literal and enum values (%s)",
    (value) => {
      expect(() => schema.literal(value)).toThrow(/schema.literal.*finite/);
      expect(() => schema.enum([value])).toThrow(/schema.enum.*finite/);
    },
  );

  it("should reject duplicate enum members while allowing distinct primitive kinds", () => {
    expect(() => schema.enum(["a", "a"])).toThrow(/schema.enum.*unique/);
    const distinct = schema.enum(["1", 1, true]);
    const validate = new Ajv2020().compile(distinct.jsonSchema);
    for (const value of ["1", 1, true, false])
      expect(distinct.safeParse(value).success).toBe(validate(value));
  });

  it.each([
    () => schema.string({ minLength: -1 }),
    () => schema.string({ maxLength: 1.5 }),
    () => schema.array(schema.string(), { maxItems: Number.NaN }),
    () => schema.object({}, { minProperties: Number.POSITIVE_INFINITY }),
    () => schema.number({ minimum: Number.NaN }),
    () => schema.number({ multipleOf: 0 }),
    () => schema.string({ pattern: 42 as unknown as string }),
  ])("should reject invalid construction constraints (%#)", (create) => {
    expect(create).toThrow(TypeError);
  });

  it("should reject cyclic projections with construction guidance, then recover", () => {
    const projection: Record<string, unknown> = {};
    projection.child = projection;
    expect(() => schema.raw(projection, (input) => ({ success: true, data: input }))).toThrow(
      /JSON Schema projection must be acyclic/,
    );
    expect(schema.string().safeParse("recovered")).toEqual({ success: true, data: "recovered" });
  });

  it("should enforce the projection depth boundary without rejecting shared references", () => {
    const create = (depth: number) => {
      let projection: Record<string, unknown> = {};
      for (let level = 0; level < depth; level++) projection = { child: projection };
      return () => schema.raw(projection, (input) => ({ success: true, data: input }));
    };
    expect(create(256)).not.toThrow();
    expect(create(257)).toThrow(/JSON Schema projection depth must not exceed 256/);
    const shared = { type: "string" };
    const result = schema.raw({ anyOf: [shared, shared] }, (input) => ({
      success: true,
      data: input,
    }));
    expect(result.jsonSchema.anyOf).toEqual([shared, shared]);
    expect(Object.isFrozen((result.jsonSchema.anyOf as object[])[0])).toBe(true);
  });

  it("should reject oversized arrays before visiting entries, then validate a bounded input", () => {
    const parse = vi.fn((input: unknown) => ({ success: true as const, data: input }));
    const value = schema.array(schema.raw({}, parse), { maxItems: 2 });
    const oversized = new Array(100_000).fill("unused");
    expect(value.safeParse(oversized)).toEqual({
      success: false,
      issues: [{ path: [], code: "too_big", message: "Expected at most 2 items." }],
    });
    expect(parse).not.toHaveBeenCalled();
    expect(value.safeParse(["one", "two"])).toEqual({ success: true, data: ["one", "two"] });
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("should reject oversized objects before reading children or additional values", () => {
    const parse = vi.fn((input: unknown) => ({ success: true as const, data: input }));
    const child = schema.raw({}, parse);
    const value = schema.object({ name: child }, { maxProperties: 1, additionalProperties: child });
    expect(value.safeParse({ name: "Ada", extra: "not visited" })).toEqual({
      success: false,
      issues: [{ path: [], code: "too_big", message: "Expected at most 1 properties." }],
    });
    expect(parse).not.toHaveBeenCalled();
    expect(value.safeParse({ name: "Ada" })).toEqual({ success: true, data: { name: "Ada" } });
    expect(parse).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    "should validate missing array slots rather than inheriting or skipping them (inherited: %s)",
    (inherited) => {
      const input = new Array<string>(1);
      if (inherited)
        Object.setPrototypeOf(
          input,
          Object.assign(Object.create(Array.prototype), { 0: "inherited" }),
        );
      expect(schema.array(schema.string(), { minItems: 1 }).safeParse(input)).toEqual({
        success: false,
        issues: [{ path: [0], code: "invalid_type", message: "Expected string." }],
      });
    },
  );

  it.each(["[", "\\"])(
    "should report malformed pattern %s and permit the next construction",
    (pattern) => {
      expect(() => schema.string({ pattern })).toThrow(SyntaxError);
      const valid = schema.string({ pattern: "^a$" });
      expect(valid.safeParse("a").success).toBe(true);
      expect(valid.safeParse("b").success).toBe(false);
    },
  );

  it("should preserve undefined optional values through both nullable wrapper orders", () => {
    const definitions = [
      schema.optional(schema.nullable(schema.string())),
      schema.nullable(schema.optional(schema.string())),
    ];
    for (const definition of definitions) {
      const value = schema.object({ entry: definition });
      expect(value.safeParse({ entry: undefined })).toEqual({ success: true, data: {} });
      expect(value.safeParse({})).toEqual({ success: true, data: {} });
      expect(value.safeParse({ entry: null })).toEqual({ success: true, data: { entry: null } });
    }
  });

  it("should validate deeply nested eager declarations with stable complete issue paths", () => {
    let value: Schema = schema.string();
    let accepted: unknown = "leaf";
    let rejected: unknown = false;
    for (let depth = 0; depth < 128; depth++) {
      value = schema.object({ child: value });
      accepted = { child: accepted };
      rejected = { child: rejected };
    }
    expect(value.safeParse(accepted)).toEqual({ success: true, data: accepted });
    expect(value.safeParse(rejected)).toEqual({
      success: false,
      issues: [
        {
          path: Array.from({ length: 128 }, () => "child"),
          code: "invalid_type",
          message: "Expected string.",
        },
      ],
    });
  });
});
