import { describe, it, expect } from "vitest";
import { formatCostFooter } from "../cost-footer.js";
import { type TokenUsage } from "../rate-tracker.js";

const usage: TokenUsage = {
  inputTokens: 1100,
  outputTokens: 300,
  cacheReadTokens: 400,
  cacheWriteTokens: 0,
};

describe("formatCostFooter", () => {
  it("returns empty string for mode=off", () => {
    expect(formatCostFooter(usage, "off", 2000)).toBe("");
  });

  it("compact: shows total tokens only", () => {
    const result = formatCostFooter(usage, "compact", 2000);
    expect(result).toMatch(/·.*tok/);
    // 1100+300 = 1400 → 1.4k
    expect(result).toContain("1.4k");
  });

  it("cost: shows cost in dollars", () => {
    const result = formatCostFooter(usage, "cost", 2000);
    expect(result).toMatch(/·\s*\$[\d.]+/);
  });

  it("verbose: shows in/out tokens, cost, and duration", () => {
    const result = formatCostFooter(usage, "verbose", 2100);
    expect(result).toContain("in");
    expect(result).toContain("out");
    expect(result).toContain("2.1s");
    expect(result).toContain("$");
  });

  it("full: includes cache tokens and model if provided", () => {
    const result = formatCostFooter(usage, "full", 2100, "claude-sonnet-4-6");
    expect(result).toContain("cache");
    expect(result).toContain("claude-sonnet-4-6");
  });

  it("full: omits cache when cacheReadTokens=0", () => {
    const noCache: TokenUsage = { ...usage, cacheReadTokens: 0 };
    const result = formatCostFooter(noCache, "full", 1000);
    expect(result).not.toContain("cache");
  });
});
