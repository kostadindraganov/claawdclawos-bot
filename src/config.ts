import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readEnvFile, type EnvMap } from "./env.js";
import { ConfigError } from "./errors.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

export type CostFooterMode = "off" | "compact" | "cost" | "verbose" | "full";

export interface Config {
  anthropicApiKey: string;
  telegramBotToken: string;
  telegramAllowlist: Set<string>;
  googleApiKey: string;
  geminiFlashModel: string;
  costFooterMode: CostFooterMode;
  dbPath: string;
  memoryConsolidateIntervalMin: number;
  schedulerTickSeconds: number;
  idleLockMinutes: number;
  dashboardPort: number;
  meetPreflightSeconds: number;
  logLevel: "debug" | "info" | "warn" | "error";
  // Security (optional — monitor-only mode if absent)
  securityPinHash?: string;
  emergencyKillPhrase?: string;
  encryptionKey?: string;
  // Phase 4: Channels + Voice
  whatsappSessionDir?: string;
  slackBotToken?: string;
  slackSigningSecret?: string;
  groqApiKey?: string;
  whisperModelPath?: string;
  elevenLabsApiKey?: string;
  gradiumApiKey?: string;
  kokoroUrl?: string;
  // Phase 5: War Room
  warroomEnabled: boolean;
  warroomMode: "live" | "legacy";
  deepgramApiKey?: string;
  cartesiaApiKey?: string;
  dashboardToken?: string;
  pikaApiKey?: string;
  recallApiKey?: string;
}

const COST_FOOTER_MODES = new Set<CostFooterMode>([
  "off", "compact", "cost", "verbose", "full",
]);

function required(env: EnvMap, key: string): string {
  const val = env[key];
  if (!val) throw new ConfigError(`Missing required env var: ${key}`);
  return val;
}

function optional(env: EnvMap, key: string, fallback: string): string {
  return env[key] ?? fallback;
}

function optionalInt(env: EnvMap, key: string, fallback: number): number {
  const val = env[key];
  if (!val) return fallback;
  const n = parseInt(val, 10);
  if (isNaN(n)) throw new ConfigError(`Env var ${key} must be an integer, got: ${val}`);
  return n;
}

export function loadConfig(envPath?: string): Config {
  const env = readEnvFile(envPath);

  const footerMode = optional(env, "COST_FOOTER_MODE", "compact");
  if (!COST_FOOTER_MODES.has(footerMode as CostFooterMode)) {
    throw new ConfigError(
      `COST_FOOTER_MODE must be one of: ${[...COST_FOOTER_MODES].join(", ")}`
    );
  }

  const allowlistRaw = optional(env, "TELEGRAM_ALLOWLIST", "");
  const telegramAllowlist = allowlistRaw
    ? new Set(allowlistRaw.split(",").map((s) => s.trim()).filter(Boolean))
    : new Set<string>();

  const pinHash = env["SECURITY_PIN_HASH"] ?? undefined;
  const killPhrase = env["EMERGENCY_KILL_PHRASE"] ?? undefined;
  const encKey = env["ENCRYPTION_KEY"] ?? undefined;

  return {
    anthropicApiKey: required(env, "ANTHROPIC_API_KEY"),
    telegramBotToken: required(env, "TELEGRAM_BOT_TOKEN"),
    telegramAllowlist,
    googleApiKey: optional(env, "GOOGLE_API_KEY", ""),
    geminiFlashModel: optional(env, "GEMINI_FLASH_MODEL", "gemini-2.5-flash"),
    costFooterMode: footerMode as CostFooterMode,
    dbPath: optional(env, "DB_PATH", resolve(PROJECT_ROOT, "store", "db.sqlite")),
    memoryConsolidateIntervalMin: optionalInt(env, "MEMORY_CONSOLIDATE_INTERVAL_MIN", 30),
    schedulerTickSeconds: optionalInt(env, "SCHEDULER_TICK_SECONDS", 60),
    idleLockMinutes: optionalInt(env, "IDLE_LOCK_MINUTES", 30),
    dashboardPort: optionalInt(env, "DASHBOARD_PORT", 3141),
    meetPreflightSeconds: optionalInt(env, "MEET_PREFLIGHT_SECONDS", 75),
    logLevel: (optional(env, "LOG_LEVEL", "info")) as Config["logLevel"],
    ...(pinHash ? { securityPinHash: pinHash } : {}),
    ...(killPhrase ? { emergencyKillPhrase: killPhrase } : {}),
    ...(encKey ? { encryptionKey: encKey } : {}),
    // Phase 4
    whatsappSessionDir: env["WHATSAPP_SESSION_DIR"] ?? undefined,
    slackBotToken: env["SLACK_BOT_TOKEN"] ?? undefined,
    slackSigningSecret: env["SLACK_SIGNING_SECRET"] ?? undefined,
    groqApiKey: env["GROQ_API_KEY"] ?? undefined,
    whisperModelPath: env["WHISPER_MODEL_PATH"] ?? undefined,
    elevenLabsApiKey: env["ELEVENLABS_API_KEY"] ?? undefined,
    gradiumApiKey: env["GRADIUM_API_KEY"] ?? undefined,
    kokoroUrl: env["KOKORO_URL"] ?? undefined,
    // Phase 5
    warroomEnabled: optional(env, "WARROOM_ENABLED", "false") === "true",
    warroomMode: optional(env, "WARROOM_MODE", "live") as "live" | "legacy",
    deepgramApiKey: env["DEEPGRAM_API_KEY"] ?? undefined,
    cartesiaApiKey: env["CARTESIA_API_KEY"] ?? undefined,
    dashboardToken: env["DASHBOARD_TOKEN"] ?? undefined,
    pikaApiKey: env["PIKA_API_KEY"] ?? undefined,
    recallApiKey: env["RECALL_API_KEY"] ?? undefined,
  };
}
