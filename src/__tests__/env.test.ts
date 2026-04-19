import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readEnvFile } from "../env.js";

let tmpFile: string;

beforeEach(() => {
  const dir = join(tmpdir(), `claudeclaw-test-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  tmpFile = join(dir, ".env");
});

afterEach(() => {
  try { unlinkSync(tmpFile); } catch { /* ok */ }
});

describe("readEnvFile", () => {
  it("parses simple key=value pairs", () => {
    writeFileSync(tmpFile, "FOO=bar\nBAZ=qux\n");
    const env = readEnvFile(tmpFile);
    expect(env["FOO"]).toBe("bar");
    expect(env["BAZ"]).toBe("qux");
  });

  it("ignores comment lines", () => {
    writeFileSync(tmpFile, "# comment\nKEY=value\n");
    const env = readEnvFile(tmpFile);
    expect(env["KEY"]).toBe("value");
    expect(Object.keys(env)).not.toContain("# comment");
  });

  it("strips double quotes from values", () => {
    writeFileSync(tmpFile, 'QUOTED="hello world"\n');
    const env = readEnvFile(tmpFile);
    expect(env["QUOTED"]).toBe("hello world");
  });

  it("strips single quotes from values", () => {
    writeFileSync(tmpFile, "SINGLE='single quoted'\n");
    const env = readEnvFile(tmpFile);
    expect(env["SINGLE"]).toBe("single quoted");
  });

  it("handles values with equals signs", () => {
    writeFileSync(tmpFile, "URL=https://example.com?a=1&b=2\n");
    const env = readEnvFile(tmpFile);
    expect(env["URL"]).toBe("https://example.com?a=1&b=2");
  });

  it("skips blank lines", () => {
    writeFileSync(tmpFile, "\nKEY=val\n\n");
    const env = readEnvFile(tmpFile);
    expect(Object.keys(env)).toHaveLength(1);
  });

  it("returns empty map for missing file", () => {
    const env = readEnvFile("/nonexistent/.env");
    expect(Object.keys(env)).toHaveLength(0);
  });

  it("does not mutate process.env", () => {
    const before = { ...process.env };
    writeFileSync(tmpFile, "SHOULD_NOT_LEAK=secret\n");
    readEnvFile(tmpFile);
    expect(process.env["SHOULD_NOT_LEAK"]).toBeUndefined();
    expect(process.env).toEqual(before);
  });
});
