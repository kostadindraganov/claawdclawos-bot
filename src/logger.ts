export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  ts: string;
  msg: string;
  meta?: unknown;
}

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let minLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

function emit(level: LogLevel, msg: string, meta?: unknown): void {
  if (LEVELS[level] < LEVELS[minLevel]) return;

  const entry: LogEntry = {
    level,
    ts: new Date().toISOString(),
    msg,
    ...(meta !== undefined ? { meta } : {}),
  };

  const line = `[${entry.ts}] [${entry.level.toUpperCase().padEnd(5)}] ${entry.msg}${
    entry.meta !== undefined ? " " + JSON.stringify(entry.meta) : ""
  }`;

  if (level === "error" || level === "warn") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export const logger = {
  debug: (msg: string, meta?: unknown) => emit("debug", msg, meta),
  info: (msg: string, meta?: unknown) => emit("info", msg, meta),
  warn: (msg: string, meta?: unknown) => emit("warn", msg, meta),
  error: (msg: string, meta?: unknown) => emit("error", msg, meta),
};
