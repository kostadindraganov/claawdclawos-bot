import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { openDatabase, closeDatabase } from "./db.js";
import {
  createScheduledTask,
  listScheduledTasks,
  deleteScheduledTask,
  toggleScheduledTask,
} from "./scheduler.js";
import { logger } from "./logger.js";

// Ensure migrations are registered
import "./memory-ingest.js";
import "./security.js";
import "./orchestrator.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

function usage(): void {
  console.log(`
CLAUDECLAW OS — Schedule CLI

Usage:
  npm run schedule create "<cron>" "<prompt>" [--agent <id>]
  npm run schedule list
  npm run schedule delete <id>
  npm run schedule enable <id>
  npm run schedule disable <id>

Examples:
  npm run schedule create "0 9 * * 1" "@research: weekly inbox scan"
  npm run schedule create "*/5 * * * *" "check system status" --agent ops
  npm run schedule list
  npm run schedule delete 3
`.trim());
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    usage();
    process.exit(0);
  }

  const config = loadConfig(resolve(PROJECT_ROOT, ".env"));
  const db = openDatabase(config.dbPath);

  try {
    switch (command) {
      case "create": {
        const cronExpr = args[1];
        const prompt = args[2];
        if (!cronExpr || !prompt) {
          console.error('Error: create requires "<cron>" "<prompt>"');
          usage();
          process.exit(1);
        }
        const agentIdx = args.indexOf("--agent");
        const agentId = agentIdx !== -1 ? args[agentIdx + 1] : undefined;
        const id = createScheduledTask(db, cronExpr, prompt, agentId);
        console.log(`✓ Created scheduled task #${id}`);
        console.log(`  Cron: ${cronExpr}`);
        console.log(`  Prompt: ${prompt}`);
        if (agentId) console.log(`  Agent: ${agentId}`);
        break;
      }

      case "list": {
        const tasks = listScheduledTasks(db);
        if (tasks.length === 0) {
          console.log("No scheduled tasks.");
          break;
        }
        console.log(`\n${"ID".padEnd(5)} ${"Cron".padEnd(18)} ${"Agent".padEnd(10)} ${"Enabled".padEnd(9)} ${"Last Run".padEnd(22)} Prompt`);
        console.log("-".repeat(90));
        for (const t of tasks) {
          const lastRun = t.last_run_ts
            ? new Date(t.last_run_ts).toISOString().replace("T", " ").slice(0, 19)
            : "never";
          console.log(
            `${String(t.id).padEnd(5)} ${t.cron_expr.padEnd(18)} ${(t.agent_id ?? "auto").padEnd(10)} ${(t.enabled ? "yes" : "no").padEnd(9)} ${lastRun.padEnd(22)} ${t.prompt.slice(0, 40)}`,
          );
        }
        console.log();
        break;
      }

      case "delete": {
        const id = parseInt(args[1] ?? "", 10);
        if (isNaN(id)) {
          console.error("Error: delete requires a task ID");
          process.exit(1);
        }
        if (deleteScheduledTask(db, id)) {
          console.log(`✓ Deleted task #${id}`);
        } else {
          console.error(`Task #${id} not found`);
          process.exit(1);
        }
        break;
      }

      case "enable": {
        const id = parseInt(args[1] ?? "", 10);
        if (isNaN(id)) {
          console.error("Error: enable requires a task ID");
          process.exit(1);
        }
        if (toggleScheduledTask(db, id, true)) {
          console.log(`✓ Enabled task #${id}`);
        } else {
          console.error(`Task #${id} not found`);
          process.exit(1);
        }
        break;
      }

      case "disable": {
        const id = parseInt(args[1] ?? "", 10);
        if (isNaN(id)) {
          console.error("Error: disable requires a task ID");
          process.exit(1);
        }
        if (toggleScheduledTask(db, id, false)) {
          console.log(`✓ Disabled task #${id}`);
        } else {
          console.error(`Task #${id} not found`);
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

main().catch((err) => {
  logger.error("schedule-cli: fatal", {
    err: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
