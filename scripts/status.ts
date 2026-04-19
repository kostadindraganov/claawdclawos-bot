import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { loadConfig } from "../src/config.js";
import { openDatabase, closeDatabase } from "../src/db.js";
import { listScheduledTasks } from "../src/scheduler.js";
import { listMissions } from "../src/mission-cli.js";
import { loadAllAgents} from "../src/agent-config.js";

// Register migrations
import "../src/memory-ingest.js";
import "../src/security.js";
import "../src/orchestrator.js";
import "../src/dashboard.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

function check(label: string, ok: boolean, detail = ""): void {
  const icon = ok ? "✓" : "✗";
  const color = ok ? "\x1b[32m" : "\x1b[31m";
  console.log(`  ${color}${icon}\x1b[0m ${label}${detail ? " — " + detail : ""}`);
}

async function main(): Promise<void> {
  console.log(`
╔══════════════════════════════════════════════════╗
║         CLAUDECLAW OS — System Status            ║
╚══════════════════════════════════════════════════╝
`);

  // .env check
  const envPath = resolve(PROJECT_ROOT, ".env");
  check(".env file", existsSync(envPath));

  let config;
  try {
    config = loadConfig(envPath);
    check("Config loaded", true);
  } catch (err) {
    check("Config loaded", false, err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // DB check
  let db;
  try {
    db = openDatabase(config.dbPath);
    check("Database", true, config.dbPath);
  } catch (err) {
    check("Database", false, err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Table checks
  const tables = ["sessions", "memories", "memories_fts", "hive_mind",
    "scheduled_tasks", "mission_tasks", "audit_log", "warroom_transcript", "meet_sessions"];
  for (const table of tables) {
    const exists = db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
    ).get(table) !== undefined;
    check(`Table: ${table}`, exists);
  }

  // Agent check
  const agents = loadAllAgents();
  check("Agents loaded", agents.size > 0, `${agents.size} agents`);

  // Scheduler check
  const tasks = listScheduledTasks(db);
  check("Scheduled tasks", true, `${tasks.length} tasks`);

  // Mission check
  const missions = listMissions(db);
  const queued = missions.filter((m) => m.status === "queued").length;
  check("Mission queue", true, `${missions.length} total, ${queued} queued`);

  // API key checks
  check("Anthropic API Key", !!config.anthropicApiKey, config.anthropicApiKey ? "set" : "missing");
  check("Telegram Bot Token", !!config.telegramBotToken, config.telegramBotToken ? "set" : "missing");
  check("Google API Key", !!config.googleApiKey, config.googleApiKey ? "set" : "not set");
  check("Groq API Key", !!config.groqApiKey, config.groqApiKey ? "set" : "not set (STT fallback only)");
  check("ElevenLabs API Key", !!config.elevenLabsApiKey, config.elevenLabsApiKey ? "set" : "not set (TTS fallback only)");
  check("Security PIN", !!config.securityPinHash, config.securityPinHash ? "configured" : "not set");
  check("Dashboard Token", !!config.dashboardToken, config.dashboardToken ? "set" : "not set");

  // War room
  const warroomServer = resolve(PROJECT_ROOT, "warroom", "server.py");
  const warroomVenv = resolve(PROJECT_ROOT, "warroom", ".venv");
  check("War Room server.py", existsSync(warroomServer));
  check("War Room Python venv", existsSync(warroomVenv), existsSync(warroomVenv) ? "installed" : "run: cd warroom && python3 -m venv .venv && pip install -r requirements.txt");
  check("War Room enabled", config.warroomEnabled, config.warroomEnabled ? `mode: ${config.warroomMode}` : "set WARROOM_ENABLED=true in .env to enable");

  console.log(`
  ── Quick Commands ──
  npm run dev          Start Telegram + Dashboard + Scheduler
  npm run warroom      Start War Room (Python + Bridge)
  npm run schedule --  create|list|delete (use -- before flags)
  npm run mission --   add|list|run|cancel (use -- before flags)
  npm run meet --      join|leave|list
`);
  closeDatabase(db);
}

main().catch((err) => {
  console.error("Status check failed:", err);
  process.exit(1);
});
