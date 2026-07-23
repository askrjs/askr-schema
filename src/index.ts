export type JsonSchema = Readonly<Record<string, unknown>>;

export interface Issue {
  readonly path: readonly (string | number)[];
  readonly message: string;
  readonly code: string;
}

export type SafeParseResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly issues: readonly Issue[] };

export interface Schema<T = unknown> {
  readonly jsonSchema: JsonSchema;
  readonly __type?: T;
  safeParse(value: unknown): SafeParseResult<T>;
}

/** An executable schema whose successful value is always a plain object. */
export interface ObjectSchema<
  T extends Record<string, unknown> = Record<string, unknown>,
> extends Schema<T> {
  readonly kind: "object";
}

export interface OptionalSchema<T> extends Schema<T | undefined> {
  readonly __optional: true;
}

export type InferSchema<T> = T extends Schema<infer Value> ? Value : never;

type CommonOptions = {
  description?: string;
  title?: string;
  examples?: readonly unknown[];
  default?: unknown;
  deprecated?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
};
export type StringFormat = "uuid" | "email" | "uri" | "date" | "date-time" | "byte" | "binary";
type StringOptions = CommonOptions & {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: StringFormat;
};
type NumberOptions = CommonOptions & {
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
};
type ArrayOptions = CommonOptions & {
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
};
type ObjectOptions = CommonOptions & {
  additionalProperties?: boolean | Schema;
  minProperties?: number;
  maxProperties?: number;
};
type OptionalKeys<T extends Record<string, Schema>> = {
  [K in keyof T]-?: T[K] extends OptionalSchema<unknown> ? K : never;
}[keyof T];
type ObjectValue<T extends Record<string, Schema>> = {
  [K in Exclude<keyof T, OptionalKeys<T>>]: InferSchema<T[K]>;
} & {
  [K in OptionalKeys<T>]?: Exclude<InferSchema<T[K]>, undefined>;
};
type UnionToIntersection<T> = (T extends unknown ? (value: T) => void : never) extends (
  value: infer Value,
) => void
  ? Value
  : never;

const optionalSchemas = new WeakSet<object>();

function immutableProjection(value: unknown): unknown {
  if (Array.isArray(value)) return Object.freeze(value.map(immutableProjection));
  if (!value || typeof value !== "object") return value;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, immutableProjection(item)] as const);
  return Object.freeze(Object.fromEntries(entries));
}

function issue(path: readonly (string | number)[], code: string, message: string): Issue {
  return Object.freeze({ path: Object.freeze([...path]), code, message });
}

function bad<T>(issues: readonly Issue[]): SafeParseResult<T> {
  return Object.freeze({ success: false, issues: Object.freeze([...issues]) });
}

function ok<T>(data: T): SafeParseResult<T> {
  return Object.freeze({ success: true, data });
}

function make<T>(
  jsonSchema: Record<string, unknown>,
  parse: (value: unknown, path: readonly (string | number)[]) => SafeParseResult<T>,
): Schema<T> {
  const result = {
    jsonSchema: immutableProjection({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      ...jsonSchema,
    }) as JsonSchema,
    safeParse: (value: unknown) => parse(value, []),
  } satisfies Schema<T>;
  return Object.freeze(result);
}

function makeObject<T extends Record<string, unknown>>(
  jsonSchema: Record<string, unknown>,
  parse: (value: unknown, path: readonly (string | number)[]) => SafeParseResult<T>,
): ObjectSchema<T> {
  const value = make(jsonSchema, parse);
  return Object.freeze({ ...value, kind: "object" as const });
}

function stringFormat(format: string | undefined, value: string): boolean {
  if (!format || format === "binary") return true;
  if (format === "uuid") {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }
  if (format === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (format === "uri") {
    try {
      const parsed = new URL(value);
      return Boolean(parsed.protocol);
    } catch {
      return false;
    }
  }
  if (format === "date") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      date.getUTCFullYear() === Number(match[1]) &&
      date.getUTCMonth() + 1 === Number(match[2]) &&
      date.getUTCDate() === Number(match[3])
    );
  }
  if (format === "date-time") {
    return /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
  }
  if (format === "byte")
    return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
  return true;
}

function string(options: StringOptions = {}): Schema<string> {
  const supportedFormats = new Set<StringFormat>([
    "uuid",
    "email",
    "uri",
    "date",
    "date-time",
    "byte",
    "binary",
  ]);
  if (options.format !== undefined && !supportedFormats.has(options.format)) {
    throw new Error(
      `Unsupported string format: ${String(options.format)}. Use schema.raw() for custom formats.`,
    );
  }
  const expression = options.pattern === undefined ? undefined : new RegExp(options.pattern);
  return make({ type: "string", ...options }, (value, path) => {
    if (typeof value !== "string") return bad([issue(path, "invalid_type", "Expected string.")]);
    if (options.minLength !== undefined && value.length < options.minLength) {
      return bad([issue(path, "too_small", `Expected at least ${options.minLength} characters.`)]);
    }
    if (options.maxLength !== undefined && value.length > options.maxLength) {
      return bad([issue(path, "too_big", `Expected at most ${options.maxLength} characters.`)]);
    }
    if (expression && !expression.test(value)) {
      return bad([issue(path, "invalid_string", "String does not match the required pattern.")]);
    }
    if (!stringFormat(options.format, value)) {
      return bad([issue(path, "invalid_string", `Expected ${options.format}.`)]);
    }
    return ok(value);
  });
}

function numeric(type: "number" | "integer", options: NumberOptions = {}): Schema<number> {
  return make({ type, ...options }, (value, path) => {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      (type === "integer" && !Number.isInteger(value))
    ) {
      return bad([issue(path, "invalid_type", `Expected ${type}.`)]);
    }
    if (options.minimum !== undefined && value < options.minimum) {
      return bad([issue(path, "too_small", `Expected at least ${options.minimum}.`)]);
    }
    if (options.maximum !== undefined && value > options.maximum) {
      return bad([issue(path, "too_big", `Expected at most ${options.maximum}.`)]);
    }
    if (options.exclusiveMinimum !== undefined && value <= options.exclusiveMinimum) {
      return bad([issue(path, "too_small", `Expected greater than ${options.exclusiveMinimum}.`)]);
    }
    if (options.exclusiveMaximum !== undefined && value >= options.exclusiveMaximum) {
      return bad([issue(path, "too_big", `Expected less than ${options.exclusiveMaximum}.`)]);
    }
    if (options.multipleOf !== undefined) {
      const quotient = value / options.multipleOf;
      if (
        !Number.isFinite(quotient) ||
        Math.abs(quotient - Math.round(quotient)) > Number.EPSILON * 16
      ) {
        return bad([issue(path, "not_multiple", `Expected a multiple of ${options.multipleOf}.`)]);
      }
    }
    return ok(value);
  });
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableValue(item)}`)
      .join(",")}}`;
  }
  return `${typeof value}:${String(value)}`;
}

function object<T extends Record<string, Schema>>(
  properties: T,
  options: ObjectOptions = {},
): ObjectSchema<ObjectValue<T>> {
  const required = Object.keys(properties).filter((key) => !optionalSchemas.has(properties[key]!));
  const schemaProperties = Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [key, value.jsonSchema]),
  );
  const { additionalProperties: additional, ...rest } = options;
  return makeObject(
    {
      type: "object",
      ...rest,
      properties: schemaProperties,
      ...(required.length ? { required } : {}),
      additionalProperties:
        additional === undefined
          ? false
          : typeof additional === "boolean"
            ? additional
            : additional.jsonSchema,
    },
    (value, path) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return bad([issue(path, "invalid_type", "Expected object.")]);
      }
      const input = value as Record<string, unknown>;
      const keys = Object.keys(input);
      const output: Record<string, unknown> = {};
      const issues: Issue[] = [];
      const hasOwn = (target: object, key: PropertyKey): boolean =>
        Object.prototype.hasOwnProperty.call(target, key);
      const defineOutput = (key: string, entry: unknown): void => {
        Object.defineProperty(output, key, {
          configurable: true,
          enumerable: true,
          value: entry,
          writable: true,
        });
      };
      if (options.minProperties !== undefined && keys.length < options.minProperties) {
        issues.push(
          issue(path, "too_small", `Expected at least ${options.minProperties} properties.`),
        );
      }
      if (options.maxProperties !== undefined && keys.length > options.maxProperties) {
        issues.push(
          issue(path, "too_big", `Expected at most ${options.maxProperties} properties.`),
        );
      }
      for (const [key, child] of Object.entries(properties)) {
        if (!hasOwn(input, key)) {
          if (!optionalSchemas.has(child))
            issues.push(issue([...path, key], "required", "Required."));
          continue;
        }
        const result = child.safeParse(input[key]);
        if (result.success) {
          if (result.data !== undefined) defineOutput(key, result.data);
        } else {
          issues.push(
            ...result.issues.map((entry) =>
              issue([...path, key, ...entry.path], entry.code, entry.message),
            ),
          );
        }
      }
      for (const key of keys) {
        if (hasOwn(properties, key)) continue;
        if (additional === true) defineOutput(key, input[key]);
        else if (additional && typeof additional !== "boolean") {
          const result = additional.safeParse(input[key]);
          if (result.success) defineOutput(key, result.data);
          else
            issues.push(
              ...result.issues.map((entry) =>
                issue([...path, key, ...entry.path], entry.code, entry.message),
              ),
            );
        } else {
          issues.push(issue([...path, key], "unrecognized_key", "Unknown key."));
        }
      }
      return issues.length ? bad(issues) : ok(output as ObjectValue<T>);
    },
  );
}

function array<T>(items: Schema<T>, options: ArrayOptions = {}): Schema<T[]> {
  return make({ type: "array", ...options, items: items.jsonSchema }, (value, path) => {
    if (!Array.isArray(value)) return bad([issue(path, "invalid_type", "Expected array.")]);
    const output: T[] = [];
    const issues: Issue[] = [];
    if (options.minItems !== undefined && value.length < options.minItems) {
      issues.push(issue(path, "too_small", `Expected at least ${options.minItems} items.`));
    }
    if (options.maxItems !== undefined && value.length > options.maxItems) {
      issues.push(issue(path, "too_big", `Expected at most ${options.maxItems} items.`));
    }
    if (options.uniqueItems && new Set(value.map(stableValue)).size !== value.length) {
      issues.push(issue(path, "not_unique", "Expected unique items."));
    }
    value.forEach((entry, index) => {
      const result = items.safeParse(entry);
      if (result.success) output.push(result.data);
      else
        issues.push(
          ...result.issues.map((item) =>
            issue([...path, index, ...item.path], item.code, item.message),
          ),
        );
    });
    return issues.length ? bad(issues) : ok(output);
  });
}

export const schema = Object.freeze({
  string,
  uuid: (options: StringOptions = {}) => string({ ...options, format: "uuid" }),
  email: (options: StringOptions = {}) => string({ ...options, format: "email" }),
  uri: (options: StringOptions = {}) => string({ ...options, format: "uri" }),
  date: (options: StringOptions = {}) => string({ ...options, format: "date" }),
  dateTime: (options: StringOptions = {}) => string({ ...options, format: "date-time" }),
  byte: (options: StringOptions = {}) => string({ ...options, format: "byte" }),
  binary: (options: StringOptions = {}) => string({ ...options, format: "binary" }),
  number: (options: NumberOptions = {}) => numeric("number", options),
  integer: (options: NumberOptions = {}) => numeric("integer", options),
  boolean: (options: CommonOptions = {}) =>
    make<boolean>({ type: "boolean", ...options }, (value, path) =>
      typeof value === "boolean"
        ? ok(value)
        : bad([issue(path, "invalid_type", "Expected boolean.")]),
    ),
  null: (options: CommonOptions = {}) =>
    make<null>({ type: "null", ...options }, (value, path) =>
      value === null ? ok(null) : bad([issue(path, "invalid_type", "Expected null.")]),
    ),
  object,
  array,
  record: <T>(values: Schema<T>, options: CommonOptions = {}) =>
    makeObject<Record<string, T>>(
      { type: "object", ...options, additionalProperties: values.jsonSchema },
      (value, path) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          return bad([issue(path, "invalid_type", "Expected object.")]);
        }
        const output: Record<string, T> = {};
        const issues: Issue[] = [];
        for (const [key, entry] of Object.entries(value)) {
          const result = values.safeParse(entry);
          if (result.success) {
            Object.defineProperty(output, key, {
              configurable: true,
              enumerable: true,
              value: result.data,
              writable: true,
            });
          }
          else
            issues.push(
              ...result.issues.map((item) =>
                issue([...path, key, ...item.path], item.code, item.message),
              ),
            );
        }
        return issues.length ? bad(issues) : ok(output);
      },
    ),
  enum: <const T extends readonly (string | number | boolean)[]>(
    values: T,
    options: CommonOptions = {},
  ) =>
    make<T[number]>({ ...options, enum: [...values] }, (value, path) =>
      values.includes(value as T[number])
        ? ok(value as T[number])
        : bad([issue(path, "invalid_enum", "Invalid enum value.")]),
    ),
  literal: <const T extends string | number | boolean | null>(
    value: T,
    options: CommonOptions = {},
  ) =>
    make<T>({ ...options, const: value }, (input, path) =>
      input === value ? ok(value) : bad([issue(path, "invalid_literal", "Invalid literal value.")]),
    ),
  optional: <T>(value: Schema<T>): OptionalSchema<T> => {
    const result = Object.freeze({
      jsonSchema: value.jsonSchema,
      __optional: true as const,
      safeParse: (input: unknown) => (input === undefined ? ok(undefined) : value.safeParse(input)),
    });
    optionalSchemas.add(result);
    return result;
  },
  nullable: <T>(value: Schema<T>) =>
    make<T | null>({ anyOf: [value.jsonSchema, { type: "null" }] }, (input) =>
      input === null ? ok(null) : value.safeParse(input),
    ),
  oneOf: <const T extends readonly Schema[]>(...values: T) =>
    make<InferSchema<T[number]>>(
      { oneOf: values.map((value) => value.jsonSchema) },
      (input, path) => {
        const matches = values
          .map((value) => value.safeParse(input))
          .filter((result) => result.success);
        return matches.length === 1
          ? ok(matches[0]!.data as InferSchema<T[number]>)
          : bad([
              issue(
                path,
                "invalid_union",
                matches.length === 0
                  ? "No union member matched."
                  : "Expected exactly one union member to match.",
              ),
            ]);
      },
    ),
  anyOf: <const T extends readonly Schema[]>(...values: T) =>
    make<InferSchema<T[number]>>(
      { anyOf: values.map((value) => value.jsonSchema) },
      (input, path) => {
        for (const value of values) {
          const result = value.safeParse(input);
          if (result.success) return ok(result.data as InferSchema<T[number]>);
        }
        return bad([issue(path, "invalid_union", "No union member matched.")]);
      },
    ),
  allOf: <const T extends readonly Schema[]>(...values: T) =>
    make<UnionToIntersection<InferSchema<T[number]>>>(
      { allOf: values.map((value) => value.jsonSchema) },
      (input) => {
        let output: unknown = input;
        const issues: Issue[] = [];
        const unknownCounts = new Map<string, { issue: Issue; count: number }>();
        for (const value of values) {
          const result = value.safeParse(input);
          if (!result.success) {
            for (const entry of result.issues) {
              if (entry.code !== "unrecognized_key") {
                issues.push(entry);
                continue;
              }
              const key = JSON.stringify(entry.path);
              const previous = unknownCounts.get(key);
              unknownCounts.set(key, { issue: entry, count: (previous?.count ?? 0) + 1 });
            }
            continue;
          }
          output =
            typeof output === "object" && output && typeof result.data === "object" && result.data
              ? { ...(output as object), ...(result.data as object) }
              : result.data;
        }
        for (const entry of unknownCounts.values()) {
          if (entry.count === values.length) issues.push(entry.issue);
        }
        if (issues.length) return bad(issues);
        return ok(output as UnionToIntersection<InferSchema<T[number]>>);
      },
    ),
  raw: <T>(
    jsonSchema: JsonSchema,
    safeParse: (value: unknown) => SafeParseResult<T>,
  ): Schema<T> => {
    const dialect = jsonSchema.$schema;
    if (dialect !== undefined && dialect !== "https://json-schema.org/draft/2020-12/schema") {
      throw new Error(`Unsupported JSON Schema dialect: ${String(dialect)}.`);
    }
    return make(jsonSchema as Record<string, unknown>, (value) => safeParse(value));
  },
});
