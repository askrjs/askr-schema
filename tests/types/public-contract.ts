import { schema, type InferSchema, type ObjectSchema, type SafeParseResult } from "../../dist/index.js";

const User = schema.object({
  id: schema.uuid(),
  nickname: schema.optional(schema.string()),
});
type User = InferSchema<typeof User>;
const user: User = { id: "3d813cbb-47fb-4d3c-a584-5e0d2f0e890a" };
void user;
const objectContract: ObjectSchema<User> = User;
void objectContract;

// @ts-expect-error unsupported formats must use schema.raw()
schema.string({ format: "hostname" });
// @ts-expect-error scalar schemas are not object transport schemas
const scalarContract: ObjectSchema = schema.string();
void scalarContract;

// @ts-expect-error id remains required
const missing: User = {};
void missing;

schema.raw<number>({ type: "integer" }, (value): SafeParseResult<number> =>
  Number.isInteger(value)
    ? { success: true, data: value as number }
    : { success: false, issues: [{ path: [], code: "invalid_type", message: "Expected integer." }] });

// @ts-expect-error raw schemas require executable validation
schema.raw({ type: "string" });

// @ts-expect-error projection-only references are intentionally absent
schema.ref("User");
