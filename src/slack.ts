import { WebClient } from "@slack/web-api";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { type AppState } from "./state.js";
import { orchestrate } from "./orchestrator.js";
import { formatCostFooter } from "./cost-footer.js";
import { logger } from "./logger.js";

// ── Types ──────────────────────────────────────────────────────────────

interface SlackEvent {
  type: string;
  challenge?: string;
  event?: {
    type: string;
    text?: string;
    user?: string;
    channel?: string;
    bot_id?: string;
    ts?: string;
  };
}

interface SlackSlashCommand {
  command: string;
  text: string;
  user_id: string;
  channel_id: string;
  response_url: string;
}

// ── Signature verification ─────────────────────────────────────────────

function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  body: string,
  signature: string,
): boolean {
  // Reject requests older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

  const baseString = `v0:${timestamp}:${body}`;
  const hmac = createHmac("sha256", signingSecret).update(baseString).digest("hex");
  const expected = `v0=${hmac}`;

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ── Read request body ──────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function parseForm(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const result: Record<string, string> = {};
  for (const [key, val] of params) {
    result[key] = val;
  }
  return result;
}

// ── Slack adapter ──────────────────────────────────────────────────────

export function createSlackAdapter(state: AppState): {
  client: WebClient;
  server: ReturnType<typeof createServer>;
} {
  const botToken = state.config.slackBotToken;
  const signingSecret = state.config.slackSigningSecret;

  if (!botToken || !signingSecret) {
    throw new Error("SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET are required");
  }

  const client = new WebClient(botToken);

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "POST") {
      res.writeHead(404);
      res.end();
      return;
    }

    const body = await readBody(req);
    const timestamp = req.headers["x-slack-request-timestamp"] as string ?? "";
    const signature = req.headers["x-slack-signature"] as string ?? "";

    if (!verifySlackSignature(signingSecret, timestamp, body, signature)) {
      logger.warn("slack: invalid signature");
      res.writeHead(401);
      res.end("Unauthorized");
      return;
    }

    const path = req.url ?? "/";

    // Events API endpoint
    if (path === "/slack/events") {
      const contentType = req.headers["content-type"] ?? "";

      if (contentType.includes("application/json")) {
        const event = JSON.parse(body) as SlackEvent;

        // URL verification challenge
        if (event.type === "url_verification" && event.challenge) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ challenge: event.challenge }));
          return;
        }

        // Acknowledge immediately
        res.writeHead(200);
        res.end();

        // Process event asynchronously
        if (event.event?.type === "message" && event.event.text && !event.event.bot_id) {
          const chatId = `slack:${event.event.channel}`;
          const text = event.event.text;
          const channel = event.event.channel!;

          state.queue.enqueue(chatId, async () => {
            try {
              const before = await state.hooks.runBefore({
                chatId,
                agentId: "main",
                text,
                hasMedia: false,
              });
              if (before === null) return;

              const results = await orchestrate({
                db: state.db,
                config: state.config,
                chatId,
                text: before.text,
              });

              for (const r of results) {
                state.rateTracker.record(chatId, r.agentId, r.result.usage);
              }

              const replyParts = results.map((r) => {
                const footer = formatCostFooter(
                  r.result.usage,
                  state.config.costFooterMode,
                  r.result.durationMs,
                  r.result.model,
                );
                const prefix = results.length > 1 ? `*[${r.agentId}]*\n` : "";
                return footer
                  ? `${prefix}${r.result.text}\n\n${footer}`
                  : `${prefix}${r.result.text}`;
              });

              let replyText = replyParts.join("\n\n---\n\n");

              const afterReply = await state.hooks.runAfter({
                chatId,
                agentId: results[0]?.agentId ?? "main",
                text: replyText,
                inputTokens: results.reduce((s, r) => s + r.result.usage.inputTokens, 0),
                outputTokens: results.reduce((s, r) => s + r.result.usage.outputTokens, 0),
                durationMs: Math.max(...results.map((r) => r.result.durationMs)),
              });

              if (afterReply === null) return;

              await client.chat.postMessage({
                channel,
                text: afterReply.text,
              });
            } catch (err) {
              logger.error("slack: message handler error", {
                err: err instanceof Error ? err.message : String(err),
              });
            }
          });
        }
        return;
      }
    }

    // Slash command endpoint
    if (path === "/slack/commands") {
      const cmd = parseForm(body) as unknown as SlackSlashCommand;

      // Acknowledge immediately
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ response_type: "in_channel", text: "Processing..." }));

      // Process asynchronously
      const chatId = `slack:${cmd.channel_id}`;
      state.queue.enqueue(chatId, async () => {
        try {
          const results = await orchestrate({
            db: state.db,
            config: state.config,
            chatId,
            text: cmd.text || "ping",
          });

          const replyText = results
            .map((r) => `*[${r.agentId}]*\n${r.result.text}`)
            .join("\n\n---\n\n");

          // Respond via response_url
          await fetch(cmd.response_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              response_type: "in_channel",
              text: replyText.slice(0, 3000),
            }),
          });
        } catch (err) {
          logger.error("slack: slash command error", {
            err: err instanceof Error ? err.message : String(err),
          });
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  return { client, server };
}

export async function startSlack(
  state: AppState,
  port = 3142,
): Promise<void> {
  const { server } = createSlackAdapter(state);
  return new Promise((resolve) => {
    server.listen(port, () => {
      logger.info(`slack: Events API server listening on :${port}`);
      resolve();
    });
  });
}
