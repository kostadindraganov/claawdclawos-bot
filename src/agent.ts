import { query } from "@anthropic-ai/claude-agent-sdk";
import { type DB } from "./db.js";
import { type Config } from "./config.js";
import { type TokenUsage } from "./rate-tracker.js";
import { SessionError } from "./errors.js";
import { logger } from "./logger.js";

export interface AgentRunOptions {
  chatId: string;
  agentId: string;
  prompt: string;
  db: DB;
  config: Config;
  allowedTools?: string[];
}

export interface AgentResult {
  text: string;
  sessionId: string;
  usage: TokenUsage;
  durationMs: number;
  model?: string;
}

function loadSessionId(db: DB, chatId: string, agentId: string): string | undefined {
  const row = db
    .prepare("SELECT session_id FROM sessions WHERE chat_id = ? AND agent_id = ?")
    .get(chatId, agentId) as { session_id: string } | undefined;
  return row?.session_id;
}

function saveSessionId(
  db: DB,
  chatId: string,
  agentId: string,
  sessionId: string,
): void {
  db.prepare(
    `INSERT INTO sessions (chat_id, agent_id, session_id, last_seen_ts)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (chat_id, agent_id)
     DO UPDATE SET session_id = excluded.session_id, last_seen_ts = excluded.last_seen_ts`,
  ).run(chatId, agentId, sessionId, Date.now());
}

export async function runAgent(opts: AgentRunOptions): Promise<AgentResult> {
  const { chatId, agentId, prompt, db, config } = opts;

  const existingSessionId = loadSessionId(db, chatId, agentId);

  const startAt = Date.now();
  const textParts: string[] = [];
  let sessionId = existingSessionId ?? "";
  const usage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  let model: string | undefined;

  const queryOptions: Parameters<typeof query>[0]["options"] = {
    ...(config.anthropicApiKey ? {} : {}),
    ...(existingSessionId ? { resume: existingSessionId } : {}),
  };

  try {
    for await (const msg of query({ prompt, options: queryOptions })) {
      if (msg.type === "system" && msg.subtype === "init") {
        sessionId = msg.session_id;
        saveSessionId(db, chatId, agentId, sessionId);
      }

      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "text") {
            textParts.push(block.text);
          }
        }
        if (msg.message.usage) {
          usage.inputTokens += msg.message.usage.input_tokens ?? 0;
          usage.outputTokens += msg.message.usage.output_tokens ?? 0;
          usage.cacheReadTokens +=
            msg.message.usage.cache_read_input_tokens ?? 0;
          usage.cacheWriteTokens +=
            msg.message.usage.cache_creation_input_tokens ?? 0;
        }
        if (msg.message.model) model = msg.message.model;
      }

      if (msg.type === "result") {
        // Terminal message; any result text appended if present
        if ("result" in msg && typeof msg.result === "string") {
          textParts.push(msg.result);
        }
      }
    }
  } catch (err) {
    throw new SessionError(
      `Agent run failed: ${err instanceof Error ? err.message : String(err)}`,
      chatId,
      agentId,
    );
  }

  if (!sessionId) {
    throw new SessionError("No session_id received from SDK", chatId, agentId);
  }

  logger.debug("agent: run complete", {
    chatId,
    agentId,
    durationMs: Date.now() - startAt,
    sessionId,
  });

  return {
    text: textParts.join("").trim(),
    sessionId,
    usage,
    durationMs: Date.now() - startAt,
    model,
  };
}

export async function runAgentWithRetry(
  opts: AgentRunOptions,
  maxAttempts = 3,
): Promise<AgentResult> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await runAgent(opts);
    } catch (err) {
      lastErr = err;
      const backoff = Math.min(1000 * 2 ** (attempt - 1), 8000);
      logger.warn(`agent: attempt ${attempt}/${maxAttempts} failed, backoff ${backoff}ms`, {
        err: err instanceof Error ? err.message : String(err),
      });
      await new Promise<void>((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}
