import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { openDatabase, closeDatabase } from "./db.js";
import { logger } from "./logger.js";

// Register migrations
import "./memory-ingest.js";
import "./security.js";
import "./orchestrator.js";
import "./scheduler.js";
import "./mission-cli.js";
import "./dashboard.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

function usage(): void {
  console.log(`
CLAUDECLAW OS — Meeting Bot CLI

Usage:
  npm run meet join <calendar_event_id> [--provider google|zoom]
  npm run meet leave <session_id>
  npm run meet list

Examples:
  npm run meet join abc123def456 --provider google
  npm run meet leave 1
  npm run meet list
`.trim());
}

async function preflight(
  db: ReturnType<typeof openDatabase>,
  calendarEventId: string,
  provider: string,
  preflightSeconds: number,
): Promise<void> {
  logger.info(`meet: starting ${preflightSeconds}s pre-flight for event ${calendarEventId}`);

  // Create session record
  const result = db
    .prepare(
      "INSERT INTO meet_sessions (calendar_event_id, provider) VALUES (?, ?)",
    )
    .run(calendarEventId, provider);
  const sessionId = Number(result.lastInsertRowid);

  console.log(`Session #${sessionId}: Pre-flight briefing started`);
  console.log(`  Event: ${calendarEventId}`);
  console.log(`  Provider: ${provider}`);
  console.log(`  Pre-flight window: ${preflightSeconds}s`);

  // Simulate pre-flight (actual implementation would pull Calendar + Gmail + Memory)
  console.log("\n  [1/3] Pulling calendar context...");
  console.log("  [2/3] Scanning recent emails for attendees...");
  console.log("  [3/3] Retrieving relevant memories...");

  const preflightData = {
    calendarEventId,
    provider,
    ts: Date.now(),
    briefing: "Pre-flight data would be populated with Calendar + Gmail + Memory context",
  };

  db.prepare(
    "UPDATE meet_sessions SET joined_ts = ?, preflight_json = ? WHERE id = ?",
  ).run(Date.now(), JSON.stringify(preflightData), sessionId);

  console.log(`\n✓ Pre-flight complete. Session #${sessionId} ready.`);
  console.log(`  Next: Pika avatar would join via ${provider}`);
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
      case "join": {
        const eventId = args[1];
        if (!eventId) {
          console.error("Error: join requires a calendar_event_id");
          process.exit(1);
        }
        const providerIdx = args.indexOf("--provider");
        const provider = providerIdx !== -1 ? (args[providerIdx + 1] ?? "google") : "google";
        await preflight(db, eventId, provider, config.meetPreflightSeconds);
        break;
      }

      case "leave": {
        const sessionId = parseInt(args[1] ?? "", 10);
        if (isNaN(sessionId)) {
          console.error("Error: leave requires a session ID");
          process.exit(1);
        }
        const result = db
          .prepare("UPDATE meet_sessions SET left_ts = ? WHERE id = ?")
          .run(Date.now(), sessionId);
        if (result.changes > 0) {
          console.log(`✓ Left session #${sessionId}`);
        } else {
          console.error(`Session #${sessionId} not found`);
        }
        break;
      }

      case "list": {
        const sessions = db
          .prepare("SELECT * FROM meet_sessions ORDER BY id DESC LIMIT 20")
          .all() as Array<{
          id: number;
          calendar_event_id: string;
          provider: string;
          joined_ts: number | null;
          left_ts: number | null;
        }>;

        if (sessions.length === 0) {
          console.log("No meeting sessions.");
          break;
        }

        console.log(
          `\n${"ID".padEnd(5)} ${"Event".padEnd(20)} ${"Provider".padEnd(10)} ${"Status".padEnd(10)}`,
        );
        console.log("-".repeat(50));
        for (const s of sessions) {
          const status = s.left_ts ? "left" : s.joined_ts ? "joined" : "pending";
          console.log(
            `${String(s.id).padEnd(5)} ${s.calendar_event_id.slice(0, 18).padEnd(20)} ${s.provider.padEnd(10)} ${status}`,
          );
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

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].includes("meet-cli") || process.argv[1].includes("meet"));

if (isDirectRun) {
  main().catch((err) => {
    logger.error("meet-cli: fatal", {
      err: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
}
