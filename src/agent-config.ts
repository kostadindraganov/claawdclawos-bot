import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { logger } from "./logger.js";
import { ConfigError } from "./errors.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const AGENTS_DIR = resolve(PROJECT_ROOT, "agents");

export interface AgentConfig {
  agentId: string;
  personaName: string;
  personaTitle: string;
  specialty: string;
  mcpAllowlist: string[];
  model?: string;
  systemPrompt: string;
  workspacePath: string;
}

interface RawAgentYaml {
  agent_id: string;
  persona_name: string;
  persona_title: string;
  specialty: string;
  mcp_allowlist?: string[];
  model?: string;
}

const KNOWN_AGENTS = ["main", "comms", "content", "ops", "research"] as const;
export type KnownAgentId = (typeof KNOWN_AGENTS)[number];

const agentCache = new Map<string, AgentConfig>();

function loadSingle(agentId: string): AgentConfig {
  const agentDir = resolve(AGENTS_DIR, agentId);
  const yamlPath = resolve(agentDir, "agent.yaml");
  const claudePath = resolve(agentDir, "CLAUDE.md");
  const workspacePath = resolve(agentDir, "workspace");

  if (!existsSync(yamlPath)) {
    throw new ConfigError(`Agent config not found: ${yamlPath}`);
  }

  const raw = parseYaml(readFileSync(yamlPath, "utf-8")) as RawAgentYaml;
  if (!raw.agent_id || raw.agent_id !== agentId) {
    throw new ConfigError(
      `agent.yaml agent_id mismatch: expected '${agentId}', got '${raw.agent_id}'`,
    );
  }

  let systemPrompt = "";
  if (existsSync(claudePath)) {
    systemPrompt = readFileSync(claudePath, "utf-8");
  }

  return {
    agentId: raw.agent_id,
    personaName: raw.persona_name ?? agentId,
    personaTitle: raw.persona_title ?? "Agent",
    specialty: raw.specialty ?? "",
    mcpAllowlist: raw.mcp_allowlist ?? [],
    model: raw.model,
    systemPrompt,
    workspacePath,
  };
}

export function getAgentConfig(agentId: string): AgentConfig {
  const cached = agentCache.get(agentId);
  if (cached) return cached;

  const config = loadSingle(agentId);
  agentCache.set(agentId, config);
  return config;
}

export function loadAllAgents(): Map<string, AgentConfig> {
  for (const id of KNOWN_AGENTS) {
    try {
      getAgentConfig(id);
    } catch (err) {
      logger.warn(`agent-config: failed to load agent '${id}'`, {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return new Map(agentCache);
}

export function isKnownAgent(agentId: string): boolean {
  return (KNOWN_AGENTS as readonly string[]).includes(agentId);
}

export function getKnownAgentIds(): readonly string[] {
  return KNOWN_AGENTS;
}

export function isToolAllowed(agentId: string, toolServer: string): boolean {
  try {
    const config = getAgentConfig(agentId);
    return config.mcpAllowlist.some(
      (allowed) => allowed.toLowerCase() === toolServer.toLowerCase(),
    );
  } catch {
    return false;
  }
}

export function clearAgentCache(): void {
  agentCache.clear();
}
