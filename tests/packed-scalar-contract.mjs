import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const root = process.cwd();
const consumer = await fs.mkdtemp(path.join(os.tmpdir(), "askr-schema-packed-"));
let tarball;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const packed = JSON.parse(
    execFileSync(npm, ["pack", "--ignore-scripts", "--json"], {
      cwd: root,
      encoding: "utf8",
    }),
  );
  tarball = path.join(root, packed[0].filename);
  await fs.writeFile(
    path.join(consumer, "package.json"),
    `${JSON.stringify({ name: "schema-packed-consumer", private: true, type: "module" })}\n`,
  );
  execFileSync(npm, ["install", "--ignore-scripts", "--no-package-lock", "--no-save", tarball], {
    cwd: consumer,
    stdio: "pipe",
  });
  const entry = path.join(consumer, "node_modules", "@askrjs", "schema", "dist", "index.js");
  const { schema } = await import(pathToFileURL(entry).href);

  const length = schema.string({ minLength: 2, maxLength: 2 });
  assert(
    length.safeParse("a😀").success,
    "packed schema must count a mixed string as two code points",
  );
  assert(!length.safeParse("😀").success, "packed schema must enforce the code-point minimum");
  assert(
    schema.string({ maxLength: 1 }).safeParse("😀").success,
    "packed schema must count one emoji as one code point",
  );
  assert(
    length.jsonSchema.minLength === 2 && length.jsonSchema.maxLength === 2,
    "packed length projection drifted",
  );

  const dateTime = schema.dateTime();
  assert(
    dateTime.safeParse("2024-02-29T23:59:59.5Z").success,
    "packed schema rejected a valid leap-day date-time",
  );
  assert(
    !dateTime.safeParse("2025-02-30T00:00:00Z").success,
    "packed schema accepted an impossible date",
  );
  assert(
    !dateTime.safeParse("2025-01-01T00:00:00").success,
    "packed schema accepted a missing offset",
  );
  assert(dateTime.jsonSchema.format === "date-time", "packed date-time projection drifted");

  const canonical = (value) => JSON.stringify(value.jsonSchema);
  const memberA = () => schema.object({ a: schema.string() });
  const memberB = () => schema.object({ b: schema.number() });
  const deterministicPairs = [
    [
      schema.object({ b: schema.string(), a: schema.number() }),
      schema.object({ a: schema.number(), b: schema.string() }),
    ],
    [schema.enum(["b", "a", "c"]), schema.enum(["c", "b", "a"])],
    [schema.oneOf(memberA(), memberB()), schema.oneOf(memberB(), memberA())],
    [schema.anyOf(memberA(), memberB()), schema.anyOf(memberB(), memberA())],
    [schema.allOf(memberA(), memberB()), schema.allOf(memberB(), memberA())],
  ];
  assert(
    deterministicPairs.every(([left, right]) => canonical(left) === canonical(right)),
    "packed schema must canonicalize order-insensitive projection arrays",
  );
  assert(
    JSON.stringify(schema.string({ examples: ["second", "first"] }).jsonSchema.examples) ===
      '["second","first"]',
    "packed schema must preserve semantically ordered examples",
  );

  const optionalOrders = [
    schema.object({ value: schema.optional(schema.nullable(schema.string())) }),
    schema.object({ value: schema.nullable(schema.optional(schema.string())) }),
  ];
  assert(
    optionalOrders.every(
      (value) =>
        value.jsonSchema.required === undefined &&
        value.safeParse({}).success &&
        value.safeParse({ value: null }).success,
    ),
    "packed schema must preserve optionality through nullable wrapper order",
  );

  const intersection = schema.allOf(
    schema.object({ id: schema.string() }),
    schema.object({ active: schema.boolean() }),
  );
  const nestedIntersection = schema.allOf(
    schema.object({ profile: schema.object({ name: schema.string() }) }),
    schema.object({ active: schema.boolean() }),
  );
  const intersectionContracts = [
    [
      intersection,
      [
        { id: "one", active: true },
        { id: "one" },
        { id: "one", active: true, extra: "no" },
      ],
    ],
    [
      nestedIntersection,
      [
        { profile: { name: "Ada" }, active: true },
        { profile: { name: "Ada", extra: "no" }, active: true },
      ],
    ],
  ];
  assert(
    intersectionContracts.every(([value, inputs]) => {
      const validate = new Ajv2020({ strict: true }).compile(value.jsonSchema);
      return inputs.every((input) => value.safeParse(input).success === validate(input));
    }),
    "packed allOf runtime and JSON Schema projection must agree",
  );

  const recursionGuidance =
    "Invalid child schema at schema.array(items). Recursive schemas are not supported by eager builders. Use schema.raw() for manual recursive validation and supply an explicit JSON Schema projection.";
  let incompleteChildError;
  try {
    schema.array(undefined);
  } catch (error) {
    incompleteChildError = error;
  }
  assert(
    incompleteChildError instanceof Error && incompleteChildError.message === recursionGuidance,
    "packed eager builders must retain stable recursion guidance",
  );
} finally {
  await fs.rm(consumer, { recursive: true, force: true });
  if (tarball) await fs.rm(tarball, { force: true });
}
