import { describe, it, expect, beforeEach } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentConfig, loadAllAgents, isToolAllowed, clearAgentCache } from "../agent-config.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

describe("agent-config", () => {
  beforeEach(() => {
    clearAgentCache();
  });

  it("loads main agent config", () => {
    const config = getAgentConfig("main");
    expect(config.agentId).toBe("main");
    expect(config.personaName).toBe("Charon");
    expect(config.personaTitle).toBe("Hand of the King");
    expect(config.mcpAllowlist).toContain("Bash");
    expect(config.mcpAllowlist).toContain("Read");
    expect(config.mcpAllowlist).toContain("Write");
    expect(config.mcpAllowlist).toContain("Grep");
  });

  it("loads comms agent config", () => {
    const config = getAgentConfig("comms");
    expect(config.agentId).toBe("comms");
    expect(config.personaName).toBe("Aoede");
    expect(config.mcpAllowlist).toContain("Gmail");
    expect(config.mcpAllowlist).toContain("Slack");
    expect(config.mcpAllowlist).toContain("Calendar");
  });

  it("loads content agent config", () => {
    const config = getAgentConfig("content");
    expect(config.agentId).toBe("content");
    expect(config.personaName).toBe("Leda");
    expect(config.mcpAllowlist).toContain("WebFetch");
  });

  it("loads ops agent config", () => {
    const config = getAgentConfig("ops");
    expect(config.agentId).toBe("ops");
    expect(config.personaName).toBe("Alnilam");
    expect(config.mcpAllowlist).toContain("Bash");
  });

  it("loads research agent config", () => {
    const config = getAgentConfig("research");
    expect(config.agentId).toBe("research");
    expect(config.personaName).toBe("Kore");
    expect(config.mcpAllowlist).toContain("WebSearch");
    expect(config.mcpAllowlist).toContain("Context7");
  });

  it("loads all 5 agents", () => {
    const all = loadAllAgents();
    expect(all.size).toBe(5);
    expect([...all.keys()].sort()).toEqual(["comms", "content", "main", "ops", "research"]);
  });

  it("isToolAllowed enforces MCP allowlist", () => {
    expect(isToolAllowed("main", "Bash")).toBe(true);
    expect(isToolAllowed("main", "Gmail")).toBe(false);
    expect(isToolAllowed("comms", "Gmail")).toBe(true);
    expect(isToolAllowed("comms", "Bash")).toBe(false);
    expect(isToolAllowed("research", "Context7")).toBe(true);
    expect(isToolAllowed("research", "Bash")).toBe(false);
  });

  it("system prompts are loaded from CLAUDE.md", () => {
    const config = getAgentConfig("main");
    expect(config.systemPrompt).toContain("Charon");
    expect(config.systemPrompt).toContain("Hand of the King");
  });

  it("throws on nonexistent agent", () => {
    expect(() => getAgentConfig("nonexistent")).toThrow();
  });
});
