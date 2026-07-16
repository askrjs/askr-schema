import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as publicApi from "./index";

describe("public surface", () => {
  it("exports only the executable schema vocabulary at runtime", () => {
    expect(Object.keys(publicApi)).toEqual(["schema"]);
  });

  it("rejects React-shaped vocabulary in package source and documentation", () => {
    const root = resolve(import.meta.dirname, "..");
    const source = [
      readFileSync(resolve(root, "src/index.ts"), "utf8"),
      readFileSync(resolve(root, "README.md"), "utf8"),
      readFileSync(resolve(root, "docs/schema.md"), "utf8"),
    ].join("\n");
    expect(source).not.toMatch(
      /\b(?:defineContext|readContext|[A-Z][A-Za-z]+Provider|use[A-Z][A-Za-z]+)\b/,
    );
  });
});
