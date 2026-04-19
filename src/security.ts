import { createHash } from "node:crypto";
import { addMigration, type DB } from "./db.js";
import { scanForSecrets } from "./exfiltration-guard.js";
import { maybeEncrypt, deriveKey } from "./crypto.js";
import { logger } from "./logger.js";
import { type AppState } from "./state.js";

addMigration(
  "audit_log",
  `CREATE TABLE audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          INTEGER NOT NULL,
    actor       TEXT NOT NULL,
    action      TEXT NOT NULL,
    detail_json TEXT
  );`,
);

interface LockState {
  locked: boolean;
  lastActivity: number;
}

const lockStates = new Map<string, LockState>();

function getState(chatId: string, idleLockMinutes: number): LockState {
  let s = lockStates.get(chatId);
  if (!s) {
    s = { locked: false, lastActivity: Date.now() };
    lockStates.set(chatId, s);
  }
  // Auto-lock if idle
  if (!s.locked && idleLockMinutes > 0) {
    const idleMs = Date.now() - s.lastActivity;
    if (idleMs > idleLockMinutes * 60_000) {
      s.locked = true;
      logger.info("security: idle auto-lock", { chatId });
    }
  }
  return s;
}

export function isLocked(chatId: string, idleLockMinutes: number): boolean {
  return getState(chatId, idleLockMinutes).locked;
}

export function touchActivity(chatId: string, idleLockMinutes: number): void {
  const s = getState(chatId, idleLockMinutes);
  s.lastActivity = Date.now();
}

export function unlock(chatId: string, pin: string, pinHash: string): boolean {
  const [salt, hash] = pinHash.split(":");
  if (!salt || !hash) return false;
  const computed = createHash("sha256").update(salt + pin).digest("hex");
  if (computed !== hash) return false;
  const s = lockStates.get(chatId);
  if (s) s.locked = false;
  return true;
}

function writeAudit(
  db: DB,
  actor: string,
  action: string,
  detail: unknown,
  encKey: Buffer | null,
): void {
  const json = JSON.stringify(detail);
  db.prepare(
    "INSERT INTO audit_log (ts, actor, action, detail_json) VALUES (?, ?, ?, ?)",
  ).run(Date.now(), actor, action, maybeEncrypt(json, encKey));
}

export function registerSecurityHooks(state: AppState): void {
  const { config, db } = state;
  const encKey = config.encryptionKey ? deriveKey(config.encryptionKey) : null;

  state.hooks.registerBefore(async (msg) => {
    const { chatId, text } = msg;
    touchActivity(chatId, config.idleLockMinutes);

    // Kill phrase check
    if (
      config.emergencyKillPhrase &&
      text.trim() === config.emergencyKillPhrase
    ) {
      writeAudit(db, chatId, "kill", { phrase: "[REDACTED]" }, encKey);
      logger.info("security: emergency kill phrase triggered");
      process.exit(0);
    }

    // Unlock command
    if (text.startsWith("/unlock ") && config.securityPinHash) {
      const pin = text.slice(8).trim();
      const ok = unlock(chatId, pin, config.securityPinHash);
      writeAudit(db, chatId, ok ? "pin_unlock" : "pin_unlock_fail", {}, encKey);
      return null; // Consume message; bot will reply separately
    }

    // Lock check
    if (config.securityPinHash && isLocked(chatId, config.idleLockMinutes)) {
      writeAudit(db, chatId, "pin_lock_block", {}, encKey);
      return null; // Block message
    }

    return msg;
  });

  state.hooks.registerAfter(async (reply) => {
    const { clean, matches } = scanForSecrets(reply.text);
    if (matches.length > 0) {
      writeAudit(
        db,
        reply.chatId,
        "redact",
        { patterns: matches },
        encKey,
      );
      logger.warn("security: redacted secrets in outbound reply", { patterns: matches });
      return { ...reply, text: clean };
    }
    return reply;
  });

  logger.info("security: hooks registered");
}
