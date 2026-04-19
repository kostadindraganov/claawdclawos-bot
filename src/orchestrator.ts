import { addMigration, type DB } from "./db.js";
import { type Config } from "./config.js";
import { runAgentWithRetry, type AgentResult } from "./agent.js";
import {
  getAgentConfig,
  isKnownAgent,
  getKnownAgentIds,
  isToolAllowed,
  type AgentConfig,
} from "./agent-config.js";
import { buildMemoryContext } from "./memory.js";
import { ingestMemory } from "./memory-ingest.js";
import { maybeEncrypt, deriveKey } from "./crypto.js";
import { logger } from "./logger.js";

// ── Hive Mind table migration ──────────────────────────────────────────
addMigration(
  "hive_mind",
  `CREATE TABLE hive_mind (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id       TEXT NOT NULL,
    target_agent   TEXT,
    ts             INTEGER NOT NULL,
    action         TEXT NOT NULL CHECK(action IN ('responded','scheduled','escalated','note')),
    payload_json   TEXT
  );`,
);

// ── Types ──────────────────────────────────────────────────────────────

export interface OrchestratorOptions {
  db: DB;
  config: Config;
  chatId: string;
  text: string;
}

export interface OrchestratorResult {
  agentId: string;
  result: AgentResult;
}

// ── Routing regex ──────────────────────────────────────────────────────

const AGENT_ROUTE_RE = /^@([a-z][a-z0-9_-]{0,29}):\s*/;
const BROADCAST_RE = /^@all:\s*/i;

export function parseRouting(text: string): {
  mode: "single" | "broadcast" | "default";
  targetAgent?: string;
  cleanText: string;
} {
  const broadcastMatch = BROADCAST_RE.exec(text);
  if (broadcastMatch) {
    return {
      mode: "broadcast",
      cleanText: text.slice(broadcastMatch[0].length),
    };
  }

  const agentMatch = AGENT_ROUTE_RE.exec(text);
  if (agentMatch && agentMatch[1]) {
    return {
      mode: "single",
      targetAgent: agentMatch[1],
      cleanText: text.slice(agentMatch[0].length),
    };
  }

  return { mode: "default", cleanText: text };
}

// ── Hive Mind ──────────────────────────────────────────────────────────

export function writeHiveMind(
  db: DB,
  agentId: string,
  action: "responded" | "scheduled" | "escalated" | "note",
  payload: unknown,
  targetAgent?: string,
  encryptionKey?: string,
): void {
  const encKey = encryptionKey ? deriveKey(encryptionKey) : null;
  const json = JSON.stringify(payload);
  db.prepare(
    `INSERT INTO hive_mind (agent_id, target_agent, ts, action, payload_json)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    agentId,
    targetAgent ?? null,
    Date.now(),
    action,
    maybeEncrypt(json, encKey),
  );
}

export function getRecentHiveMind(
  db: DB,
  limit = 20,
): Array<{
  id: number;
  agent_id: string;
  target_agent: string | null;
  ts: number;
  action: string;
  payload_json: string | null;
}> {
  return db
    .prepare(
      "SELECT id, agent_id, target_agent, ts, action, payload_json FROM hive_mind ORDER BY ts DESC LIMIT ?",
    )
    .all(limit) as Array<{
    id: number;
    agent_id: string;
    target_agent: string | null;
    ts: number;
    action: string;
    payload_json: string | null;
  }>;
}

// ── Run single agent with memory + hive-mind ───────────────────────────

async function runAgentWithContext(
  agentId: string,
  prompt: string,
  opts: OrchestratorOptions,
): Promise<AgentResult> {
  const { db, config, chatId } = opts;

  let agentConfig: AgentConfig | undefined;
  try {
    agentConfig = getAgentConfig(agentId);
  } catch {
    logger.warn(`orchestrator: unknown agent '${agentId}', falling back to main`);
    agentConfig = getAgentConfig("main");
  }

  // Build memory context if Google API key is available
  let fullPrompt = prompt;
  if (config.googleApiKey) {
    try {
      const memCtx = await buildMemoryContext({
        db,
        chatId,
        queryText: prompt,
        googleApiKey: config.googleApiKey,
        encryptionKey: config.encryptionKey,
      });
      if (memCtx) fullPrompt = `${memCtx}\n\n---\n\n${prompt}`;
    } catch (err) {
      logger.warn("orchestrator: memory context failed", { err });
    }
  }

  // Prepend agent system prompt if available
  if (agentConfig.systemPrompt) {
    fullPrompt = `${agentConfig.systemPrompt}\n\n---\n\n${fullPrompt}`;
  }

  const result = await runAgentWithRetry({
    chatId,
    agentId,
    prompt: fullPrompt,
    db,
    config,
    allowedTools: agentConfig.mcpAllowlist,
  });

  // Write to hive mind
  writeHiveMind(
    db,
    agentId,
    "responded",
    {
      prompt_preview: prompt.slice(0, 200),
      reply_preview: result.text.slice(0, 200),
      tokens: result.usage.inputTokens + result.usage.outputTokens,
    },
    undefined,
    config.encryptionKey,
  );

  // Fire-and-forget memory ingest
  if (config.googleApiKey) {
    void ingestMemory({
      db,
      chatId,
      agentId,
      userMessage: prompt,
      assistantReply: result.text,
      googleApiKey: config.googleApiKey,
      geminiModel: config.geminiFlashModel,
      encryptionKey: config.encryptionKey,
    }).catch((err) => logger.warn("orchestrator: memory ingest failed", { err }));
  }

  return result;
}

// ── Orchestrate ────────────────────────────────────────────────────────

export async function orchestrate(
  opts: OrchestratorOptions,
): Promise<OrchestratorResult[]> {
  const { text } = opts;
  const routing = parseRouting(text);

  switch (routing.mode) {
    case "broadcast": {
      // Send to all known agents in parallel
      const agentIds = getKnownAgentIds();
      const results = await Promise.allSettled(
        agentIds.map(async (agentId) => {
          const result = await runAgentWithContext(
            agentId,
            routing.cleanText,
            opts,
          );
          return { agentId, result };
        }),
      );

      const successes: OrchestratorResult[] = [];
      for (const r of results) {
        if (r.status === "fulfilled") {
          successes.push(r.value);
        } else {
          logger.error("orchestrator: broadcast agent failed", {
            reason: r.reason,
          });
        }
      }
      return successes;
    }

    case "single": {
      const agentId = routing.targetAgent!;
      if (!isKnownAgent(agentId)) {
        logger.warn(`orchestrator: unknown target agent '${agentId}', using main`);
      }
      const result = await runAgentWithContext(
        agentId,
        routing.cleanText,
        opts,
      );
      return [{ agentId, result }];
    }

    case "default": {
      // Default to main agent
      const result = await runAgentWithContext(
        "main",
        routing.cleanText,
        opts,
      );
      return [{ agentId: "main", result }];
    }
  }
}

export { isToolAllowed };
