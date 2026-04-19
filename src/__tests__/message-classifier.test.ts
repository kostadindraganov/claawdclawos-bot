import { describe, it, expect } from "vitest";
import { classify } from "../message-classifier.js";

describe("classify", () => {
  describe("command class", () => {
    it("returns command for /schedule", () => {
      const r = classify("/schedule create * * * * * @main: ping");
      expect(r.class).toBe("command");
      expect(r.command).toBe("schedule");
    });

    it("returns command for /meet", () => {
      const r = classify("/meet join abc123");
      expect(r.class).toBe("command");
      expect(r.command).toBe("meet");
    });
  });

  describe("complex class via agent routing", () => {
    it("routes @research: prefix to research agent", () => {
      const r = classify("@research: find competitor pricing");
      expect(r.class).toBe("complex");
      expect(r.targetAgent).toBe("research");
    });

    it("routes @all: prefix with no specific target", () => {
      const r = classify("@all: good morning");
      expect(r.class).toBe("complex");
      expect(r.targetAgent).toBe("all");
    });
  });

  describe("complex class via content heuristics", () => {
    it("classifies messages with code fences as complex", () => {
      const r = classify("fix this:\n```ts\nconst x = 1;\n```");
      expect(r.class).toBe("complex");
    });

    it("classifies messages over 80 chars as complex", () => {
      const long = "a".repeat(81);
      const r = classify(long);
      expect(r.class).toBe("complex");
    });

    it("classifies messages with a question mark as complex", () => {
      const r = classify("What is the capital of France?");
      expect(r.class).toBe("complex");
    });
  });

  describe("simple class", () => {
    it("classifies short messages without ? as simple", () => {
      const r = classify("hello there");
      expect(r.class).toBe("simple");
    });

    it("classifies exactly 80 chars without ? as simple", () => {
      const r = classify("a".repeat(80));
      expect(r.class).toBe("simple");
    });

    it("classifies 1-char message as simple", () => {
      const r = classify("k");
      expect(r.class).toBe("simple");
    });
  });
});
