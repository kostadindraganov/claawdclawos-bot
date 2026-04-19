import { describe, it, expect } from "vitest";
import { parseRouting } from "../orchestrator.js";

describe("orchestrator routing", () => {
  it("routes @agent: to single agent", () => {
    const r = parseRouting("@research: latest pricing on Anthropic API");
    expect(r.mode).toBe("single");
    expect(r.targetAgent).toBe("research");
    expect(r.cleanText).toBe("latest pricing on Anthropic API");
  });

  it("routes @all: to broadcast", () => {
    const r = parseRouting("@all: what's blocking the launch?");
    expect(r.mode).toBe("broadcast");
    expect(r.cleanText).toBe("what's blocking the launch?");
  });

  it("defaults to main for unrouted messages", () => {
    const r = parseRouting("hello, how are you?");
    expect(r.mode).toBe("default");
    expect(r.cleanText).toBe("hello, how are you?");
  });

  it("handles @main: routing", () => {
    const r = parseRouting("@main: check system status");
    expect(r.mode).toBe("single");
    expect(r.targetAgent).toBe("main");
    expect(r.cleanText).toBe("check system status");
  });

  it("handles @comms: routing", () => {
    const r = parseRouting("@comms: draft an email to Bob");
    expect(r.mode).toBe("single");
    expect(r.targetAgent).toBe("comms");
  });

  it("handles @content: routing", () => {
    const r = parseRouting("@content: write a blog post about AI");
    expect(r.mode).toBe("single");
    expect(r.targetAgent).toBe("content");
  });

  it("handles @ops: routing", () => {
    const r = parseRouting("@ops: check server logs");
    expect(r.mode).toBe("single");
    expect(r.targetAgent).toBe("ops");
  });

  it("@all: is case insensitive", () => {
    const r = parseRouting("@ALL: ping everyone");
    expect(r.mode).toBe("broadcast");
  });

  it("ignores @ in the middle of text", () => {
    const r = parseRouting("send email to user@example.com");
    expect(r.mode).toBe("default");
  });

  it("handles agent ID with dashes", () => {
    const r = parseRouting("@my-agent: do something");
    expect(r.mode).toBe("single");
    expect(r.targetAgent).toBe("my-agent");
  });
});
