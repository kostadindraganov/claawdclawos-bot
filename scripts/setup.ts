import { createInterface } from "node:readline";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string, defaultVal = ""): Promise<string> {
  const suffix = defaultVal ? ` [${defaultVal}]` : "";
  return new Promise((resolve) => {
    rl.question(`  ${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultVal);
    });
  });
}

function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(salt + pin).digest("hex");
  return `${salt}:${hash}`;
}

async function main(): Promise<void> {
  console.log(`
╔══════════════════════════════════════════════════╗
║         CLAUDECLAW OS — Setup Wizard             ║
╚══════════════════════════════════════════════════╝
`);

  const envPath = resolve(PROJECT_ROOT, ".env");
  const existing: Record<string, string> = {};

  if (existsSync(envPath)) {
    console.log("  Found existing .env file. Values will be preserved unless overwritten.\n");
    for (const line of readFileSync(envPath, "utf-8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      existing[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  }

  console.log("  ── Required Keys ──\n");

  const anthropicKey = await ask(
    "Anthropic API Key (ANTHROPIC_API_KEY)",
    existing["ANTHROPIC_API_KEY"] ?? "",
  );

  const telegramToken = await ask(
    "Telegram Bot Token (TELEGRAM_BOT_TOKEN)",
    existing["TELEGRAM_BOT_TOKEN"] ?? "",
  );

  const googleKey = await ask(
    "Google API Key for Gemini (GOOGLE_API_KEY)",
    existing["GOOGLE_API_KEY"] ?? "",
  );

  console.log("\n  ── Optional Keys ──\n");

  const groqKey = await ask(
    "Groq API Key (GROQ_API_KEY, for voice STT)",
    existing["GROQ_API_KEY"] ?? "",
  );

  const elevenLabsKey = await ask(
    "ElevenLabs API Key (ELEVENLABS_API_KEY, for TTS)",
    existing["ELEVENLABS_API_KEY"] ?? "",
  );

  const slackToken = await ask(
    "Slack Bot Token (SLACK_BOT_TOKEN)",
    existing["SLACK_BOT_TOKEN"] ?? "",
  );

  const slackSecret = await ask(
    "Slack Signing Secret (SLACK_SIGNING_SECRET)",
    existing["SLACK_SIGNING_SECRET"] ?? "",
  );

  console.log("\n  ── Security ──\n");

  const wantPin = await ask("Set a security PIN? (y/n)", "y");
  let pinHash = existing["SECURITY_PIN_HASH"] ?? "";
  if (wantPin.toLowerCase() === "y") {
    const pin = await ask("Enter PIN");
    if (pin) {
      pinHash = hashPin(pin);
      console.log("  ✓ PIN hash generated");
    }
  }

  const killPhrase = await ask(
    "Emergency kill phrase",
    existing["EMERGENCY_KILL_PHRASE"] ?? "shutdown everything now",
  );

  const dashboardToken = await ask(
    "Dashboard access token",
    existing["DASHBOARD_TOKEN"] ?? randomBytes(16).toString("hex"),
  );

  // Build .env content
  const env = `# ── Core ──────────────────────────────────────────────
ANTHROPIC_API_KEY=${anthropicKey}
TELEGRAM_BOT_TOKEN=${telegramToken}
TELEGRAM_ALLOWLIST=${existing["TELEGRAM_ALLOWLIST"] ?? ""}
COST_FOOTER_MODE=${existing["COST_FOOTER_MODE"] ?? "compact"}

# ── Memory v2 ─────────────────────────────────────────
GOOGLE_API_KEY=${googleKey}
MEMORY_CONSOLIDATE_INTERVAL_MIN=${existing["MEMORY_CONSOLIDATE_INTERVAL_MIN"] ?? "30"}

# ── Security ──────────────────────────────────────────
SECURITY_PIN_HASH=${pinHash}
IDLE_LOCK_MINUTES=${existing["IDLE_LOCK_MINUTES"] ?? "30"}
EMERGENCY_KILL_PHRASE=${killPhrase}

# ── Voice ─────────────────────────────────────────────
GROQ_API_KEY=${groqKey}
ELEVENLABS_API_KEY=${elevenLabsKey}
KOKORO_URL=${existing["KOKORO_URL"] ?? "http://localhost:8880"}

# ── Slack ─────────────────────────────────────────────
SLACK_BOT_TOKEN=${slackToken}
SLACK_SIGNING_SECRET=${slackSecret}

# ── Dashboard ─────────────────────────────────────────
DASHBOARD_TOKEN=${dashboardToken}
DASHBOARD_PORT=${existing["DASHBOARD_PORT"] ?? "3141"}

# ── War Room ──────────────────────────────────────────
WARROOM_ENABLED=${existing["WARROOM_ENABLED"] ?? "false"}
WARROOM_MODE=${existing["WARROOM_MODE"] ?? "live"}
`;

  writeFileSync(envPath, env);
  console.log(`\n  ✓ .env written to ${envPath}`);
  console.log(`\n  Dashboard URL: http://localhost:${existing["DASHBOARD_PORT"] ?? "3141"}?token=${dashboardToken}`);
  console.log("\n  Next steps:");
  console.log("    npm run dev      — Start in development mode");
  console.log("    npm run start    — Start in production mode");
  console.log("    npm run status   — Check system health");

  rl.close();
}

main().catch((err) => {
  console.error("Setup failed:", err);
  rl.close();
  process.exit(1);
});
