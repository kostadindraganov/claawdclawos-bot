import { addMigration, type DB } from "./db.js";
import { type Config } from "./config.js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { openDatabase, closeDatabase } from "./db.js";
import { orchestrate } from "./orchestrator.js";
import { logger } from "./logger.js";

// Ensure migrations are registered
import "./memory-ingest.js";
import "./security.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

// ── Mission Tasks table ────────────────────────────────────────────────
addMigration(
  "mission_tasks",
  `CREATE TABLE mission_tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt      TEXT NOT NULL,
    priority    INTEGER NOT NULL DEFAULT 5 CHECK(priority BETWEEN 0 AND 9),
    status      TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','done','failed')),
    agent_id    TEXT,
    created_ts  INTEGER NOT NULL,
    finished_ts INTEGER,
    result      TEXT
  );`,
);

// ── CRUD ──────────────────────────────────────────────────────────────

export interface MissionTaskRow {
  id: number;
  prompt: string;
  priority: number;
  status: string;
  agent_id: string | null;
  created_ts: number;
  finished_ts: number | null;
  result: string | null;
}

export function addMission(
  db: DB,
  prompt: string,
  priority = 5,
  agentId?: string,
): number {
  const result = db
    .prepare(
      `INSERT INTO mission_tasks (prompt, priority, agent_id, created_ts)
       VALUES (?, ?, ?, ?)`,
    )
    .run(prompt, priority, agentId ?? null, Date.now());
  return Number(result.lastInsertRowid);
}

export function listMissions(
  db: DB,
  statusFilter?: string,
): MissionTaskRow[] {
  if (statusFilter) {
    return db
      .prepare(
        "SELECT * FROM mission_tasks WHERE status = ? ORDER BY priority DESC, created_ts ASC",
      )
      .all(statusFilter) as MissionTaskRow[];
  }
  return db
    .prepare(
      "SELECT * FROM mission_tasks ORDER BY priority DESC, created_ts ASC",
    )
    .all() as MissionTaskRow[];
}

export function cancelMission(db: DB, taskId: number): boolean {
  const result = db
    .prepare(
      "UPDATE mission_tasks SET status = 'failed', finished_ts = ? WHERE id = ? AND status IN ('queued','running')",
    )
    .run(Date.now(), taskId);
  return result.changes > 0;
}

export async function runNextMission(
  db: DB,
  config: Config,
  defaultChatId: string,
): Promise<MissionTaskRow | null> {
  const task = db
    .prepare(
      "SELECT * FROM mission_tasks WHERE status = 'queued' ORDER BY priority DESC, created_ts ASC LIMIT 1",
    )
    .get() as MissionTaskRow | undefined;

  if (!task) return null;

  // Mark running
  db.prepare("UPDATE mission_tasks SET status = 'running' WHERE id = ?").run(
    task.id,
  );

  try {
    const prompt = task.agent_id
      ? `@${task.agent_id}: ${task.prompt}`
      : task.prompt;

    const results = await orchestrate({
      db,
      config,
      chatId: defaultChatId,
      text: prompt,
    });

    const replyText = results.map((r) => `[${r.agentId}]: ${r.result.text}`).join("\n\n");

    db.prepare(
      "UPDATE mission_tasks SET status = 'done', finished_ts = ?, result = ? WHERE id = ?",
    ).run(Date.now(), replyText.slice(0, 10_000), task.id);

    return { ...task, status: "done", result: replyText };
  } catch (err) {
    db.prepare(
      "UPDATE mission_tasks SET status = 'failed', finished_ts = ?, result = ? WHERE id = ?",
    ).run(
      Date.now(),
      err instanceof Error ? err.message : String(err),
      task.id,
    );
    return { ...task, status: "failed" };
  }
}

// ── CLI ──────────────────────────────────────────────────────────────

function usage(): void {
  console.log(`
CLAUDECLAW OS — Mission CLI

Usage:
  npm run mission add "<prompt>" [--priority <0-9>] [--agent <id>]
  npm run mission list [--status queued|running|done|failed]
  npm run mission run
  npm run mission cancel <id>

Examples:
  npm run mission add "draft a tweet about our launch" --priority 7
  npm run mission add "analyze competitor pricing" --agent research --priority 8
  npm run mission list
  npm run mission list --status queued
  npm run mission run
  npm run mission cancel 5
`.trim());
}

function parseCliArgs(args: string[]): {
  command: string;
  positional: string[];
  flags: Record<string, string>;
} {
  const command = args[0] ?? "";
  const positional: string[] = [];
  const flags: Record<string, string> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("--") && i + 1 < args.length) {
      flags[arg.slice(2)] = args[++i]!;
    } else {
      positional.push(arg);
    }
  }
  return { command, positional, flags };
}

async function main(): Promise<void> {
  const { command, positional, flags } = parseCliArgs(process.argv.slice(2));

  if (!command || command === "--help" || command === "-h") {
    usage();
    process.exit(0);
  }

  const config = loadConfig(resolve(PROJECT_ROOT, ".env"));
  const db = openDatabase(config.dbPath);

  try {
    switch (command) {
      case "add": {
        const prompt = positional[0];
        if (!prompt) {
          console.error('Error: add requires "<prompt>"');
          usage();
          process.exit(1);
        }
        const priority = flags["priority"] ? parseInt(flags["priority"], 10) : 5;
        const agentId = flags["agent"];
        const id = addMission(db, prompt, priority, agentId);
        console.log(`✓ Created mission #${id} (priority ${priority})`);
        console.log(`  Prompt: ${prompt}`);
        if (agentId) console.log(`  Agent: ${agentId}`);
        break;
      }

      case "list": {
        const statusFilter = flags["status"];
        const tasks = listMissions(db, statusFilter);
        if (tasks.length === 0) {
          console.log(statusFilter ? `No ${statusFilter} missions.` : "No missions.");
          break;
        }
        console.log(
          `\n${"ID".padEnd(5)} ${"Pri".padEnd(5)} ${"Status".padEnd(10)} ${"Agent".padEnd(10)} ${"Created".padEnd(22)} Prompt`,
        );
        console.log("-".repeat(90));
        for (const t of tasks) {
          const created = new Date(t.created_ts)
            .toISOString()
            .replace("T", " ")
            .slice(0, 19);
          console.log(
            `${String(t.id).padEnd(5)} ${String(t.priority).padEnd(5)} ${t.status.padEnd(10)} ${(t.agent_id ?? "auto").padEnd(10)} ${created.padEnd(22)} ${t.prompt.slice(0, 40)}`,
          );
        }
        console.log();
        break;
      }

      case "run": {
        const chatId = flags["chat-id"] ?? "cli";
        console.log("Running next queued mission...");
        const result = await runNextMission(db, config, chatId);
        if (!result) {
          console.log("No queued missions.");
        } else {
          console.log(`Mission #${result.id}: ${result.status}`);
          if (result.result) {
            console.log(`\nResult:\n${result.result.slice(0, 2000)}`);
          }
        }
        break;
      }

      case "cancel": {
        const id = parseInt(positional[0] ?? "", 10);
        if (isNaN(id)) {
          console.error("Error: cancel requires a mission ID");
          process.exit(1);
        }
        if (cancelMission(db, id)) {
          console.log(`✓ Cancelled mission #${id}`);
        } else {
          console.error(`Mission #${id} not found or already completed`);
          process.exit(1);
        }
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        usage();
        process.exit(1);
    }
  } finally {
    closeDatabase(db);
  }
}

// Only run CLI when invoked directly (not when imported as a module)
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].includes("mission-cli") || process.argv[1].includes("mission"));

if (isDirectRun) {
  main().catch((err) => {
    logger.error("mission-cli: fatal", {
      err: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
}
