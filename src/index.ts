import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { openDatabase, closeDatabase } from "./db.js";
import { initState, getState } from "./state.js";
import { MessageQueue } from "./message-queue.js";
import { HookRegistry } from "./hooks.js";
import { RateTracker } from "./rate-tracker.js";
import { createTelegramBot } from "./telegram.js";
import { registerSecurityHooks } from "./security.js";
import { loadAllAgents } from "./agent-config.js";
import { startScheduler, stopScheduler } from "./scheduler.js";
import { startDashboard } from "./dashboard.js";
import { startWarRoom, startBridge, stopWarRoom } from "./agent-voice-bridge.js";
import { logger, setLogLevel } from "./logger.js";

// Import Phase 2+ modules so their migrations are registered before DB open
import "./memory-ingest.js";
import "./orchestrator.js";
import "./mission-cli.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

async function bootstrap(): Promise<void> {
  const config = loadConfig(resolve(PROJECT_ROOT, ".env"));
  setLogLevel(config.logLevel);

  logger.info("claudeclaw: starting up");

  const db = openDatabase(config.dbPath);

  const state = {
    db,
    config,
    queue: new MessageQueue(),
    hooks: new HookRegistry(),
    rateTracker: new RateTracker(),
    startedAt: new Date(),
  };

  initState(state);

  // Register security hooks (PIN, exfiltration guard, kill phrase)
  registerSecurityHooks(getState());

  // Load agent configurations
  const agents = loadAllAgents();
  logger.info(`claudeclaw: loaded ${agents.size} agents`, {
    agents: [...agents.keys()],
  });

  const bot = createTelegramBot(getState());

  // Determine default chat ID for scheduler (first in allowlist, or 'system')
  const defaultChatId =
    config.telegramAllowlist.size > 0
      ? [...config.telegramAllowlist][0]!
      : "system";

  // Start scheduler
  startScheduler(db, config, defaultChatId);

  // Start dashboard
  startDashboard(db, config);

  // Start war room if enabled
  if (config.warroomEnabled) {
    startWarRoom();
    startBridge(db, config);
    logger.info("claudeclaw: war room started");
  }

  async function shutdown(signal: string): Promise<void> {
    logger.info(`claudeclaw: received ${signal}, shutting down`);
    stopScheduler();
    stopWarRoom();
    await state.queue.gracefulDrain(10_000);
    bot.stop();
    closeDatabase(db);
    logger.info("claudeclaw: clean exit");
    process.exit(0);
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    logger.info("claudeclaw: starting Telegram bot");
    await bot.start({
      onStart: (info) => {
        logger.info(`claudeclaw: bot @${info.username} online`);
      },
    });
  } catch (err) {
    logger.error("claudeclaw: bot crashed", {
      err: err instanceof Error ? err.message : String(err),
    });
    stopScheduler();
    closeDatabase(db);
    process.exit(1);
  }
}

bootstrap().catch((err) => {
  process.stderr.write(
    `[FATAL] ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
