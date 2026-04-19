import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { type DB, addMigration } from "./db.js";
import { type Config } from "./config.js";
import { getRecentHiveMind } from "./orchestrator.js";
import { searchMemories } from "./memory.js";
import { listMissions, addMission, type MissionTaskRow } from "./mission-cli.js";
import { listScheduledTasks } from "./scheduler.js";
import { getKnownAgentIds, getAgentConfig } from "./agent-config.js";
import { getDashboardHtml } from "./dashboard-html.js";
import { logger } from "./logger.js";

// ── DB migrations for Phase 5 ─────────────────────────────────────────
addMigration(
  "warroom_transcript",
  `CREATE TABLE warroom_transcript (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    speaker    TEXT NOT NULL,
    ts         INTEGER NOT NULL,
    text       TEXT NOT NULL
  );`,
);

addMigration(
  "meet_sessions",
  `CREATE TABLE meet_sessions (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    calendar_event_id TEXT NOT NULL,
    provider          TEXT NOT NULL CHECK(provider IN ('google','zoom')),
    joined_ts         INTEGER,
    left_ts           INTEGER,
    preflight_json    TEXT
  );`,
);

// ── SSE Management ─────────────────────────────────────────────────────

type SSEClient = {
  id: string;
  send: (event: string, data: unknown) => void;
};

const sseClients: SSEClient[] = [];

export function broadcastSSE(event: string, data: unknown): void {
  for (const client of sseClients) {
    try {
      client.send(event, data);
    } catch {
      // Remove dead clients on error
    }
  }
}

// ── Dashboard state snapshot ───────────────────────────────────────────

function getStateSnapshot(db: DB) {
  const agentIds = getKnownAgentIds();
  const agents = agentIds.map((id) => {
    try {
      const cfg = getAgentConfig(id);
      return {
        id: cfg.agentId,
        persona: cfg.personaName,
        title: cfg.personaTitle,
        specialty: cfg.specialty,
        mcpAllowlist: cfg.mcpAllowlist,
      };
    } catch {
      return { id, persona: id, title: "Unknown", specialty: "", mcpAllowlist: [] as string[] };
    }
  });

  const hiveMind = getRecentHiveMind(db, 50);
  const missions = listMissions(db);
  const scheduled = listScheduledTasks(db);

  return { agents, hiveMind, missions, scheduled, ts: Date.now() };
}

// ── Hono app ───────────────────────────────────────────────────────────

export function createDashboardApp(db: DB, config: Config): Hono {
  const app = new Hono();

  // Auth middleware
  app.use("*", async (c, next) => {
    // Skip auth if no dashboard token configured
    if (!config.dashboardToken) {
      return next();
    }

    const token =
      c.req.query("token") ??
      c.req.header("Authorization")?.replace("Bearer ", "");

    if (token !== config.dashboardToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return next();
  });

  // SPA shell
  app.get("/", (c) => {
    return c.html(getDashboardHtml());
  });

  // API: state snapshot
  app.get("/api/state", (c) => {
    return c.json(getStateSnapshot(db));
  });

  // API: memory search
  app.get("/api/memory", (c) => {
    const query = c.req.query("q") ?? "";
    const chatId = c.req.query("chat_id") ?? "";
    if (!query || !chatId) {
      return c.json({ results: [] });
    }
    const results = searchMemories(db, chatId, query, config.encryptionKey);
    return c.json({ results });
  });

  // API: audit log
  app.get("/api/audit", (c) => {
    const since = parseInt(c.req.query("since") ?? "0", 10);
    const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);
    const rows = db
      .prepare(
        "SELECT * FROM audit_log WHERE ts >= ? ORDER BY ts DESC LIMIT ?",
      )
      .all(since, limit);
    return c.json({ rows });
  });

  // API: create mission
  app.post("/api/mission", async (c) => {
    const body = (await c.req.json()) as {
      prompt?: string;
      priority?: number;
      agent_id?: string;
    };
    if (!body.prompt) {
      return c.json({ error: "prompt is required" }, 400);
    }
    const id = addMission(db, body.prompt, body.priority ?? 5, body.agent_id);
    broadcastSSE("mission", { id, prompt: body.prompt, status: "queued" });
    return c.json({ id });
  });

  // API: hive mind
  app.get("/api/hive-mind", (c) => {
    const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);
    const rows = getRecentHiveMind(db, limit);
    return c.json({ rows });
  });

  // SSE endpoint
  app.get("/sse", (c) => {
    const clientId = `sse-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return new Response(
      new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();

          const client: SSEClient = {
            id: clientId,
            send: (event, data) => {
              try {
                controller.enqueue(
                  encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
                );
              } catch {
                // Stream may be closed
              }
            },
          };

          sseClients.push(client);
          logger.debug("dashboard: SSE client connected", { clientId });

          // Send initial state
          client.send("state", getStateSnapshot(db));

          // Heartbeat
          const heartbeat = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(": heartbeat\n\n"));
            } catch {
              clearInterval(heartbeat);
            }
          }, 15_000);

          // Cleanup on close — handle via controller signal if supported
        },
        cancel() {
          const idx = sseClients.findIndex((c) => c.id === clientId);
          if (idx !== -1) sseClients.splice(idx, 1);
          logger.debug("dashboard: SSE client disconnected", { clientId });
        },
      }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      },
    );
  });

  return app;
}

// ── Start dashboard server ─────────────────────────────────────────────

export function startDashboard(db: DB, config: Config): void {
  const app = createDashboardApp(db, config);

  serve({
    fetch: app.fetch,
    port: config.dashboardPort,
  });

  logger.info(`dashboard: listening on http://localhost:${config.dashboardPort}`);
}
