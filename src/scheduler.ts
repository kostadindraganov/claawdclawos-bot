import { addMigration, type DB } from "./db.js";
import { type Config } from "./config.js";
import { orchestrate } from "./orchestrator.js";
import { logger } from "./logger.js";

// ── Scheduled Tasks table ──────────────────────────────────────────────
addMigration(
  "scheduled_tasks",
  `CREATE TABLE scheduled_tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    cron_expr   TEXT NOT NULL,
    prompt      TEXT NOT NULL,
    agent_id    TEXT,
    last_run_ts INTEGER,
    next_run_ts INTEGER NOT NULL,
    enabled     INTEGER NOT NULL DEFAULT 1
  );`,
);

// ── Cron parsing (simplified — supports standard 5-field expressions) ──

interface CronFields {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
}

function parseField(field: string, min: number, max: number): number[] {
  if (field === "*") {
    return Array.from({ length: max - min + 1 }, (_, i) => i + min);
  }

  const values: number[] = [];
  for (const part of field.split(",")) {
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    if (stepMatch) {
      const [, range, stepStr] = stepMatch;
      const step = parseInt(stepStr!, 10);
      let start = min;
      let end = max;
      if (range !== "*" && range !== undefined) {
        const [s, e] = range.split("-").map(Number);
        if (s !== undefined) start = s;
        if (e !== undefined) end = e;
      }
      for (let i = start; i <= end; i += step) values.push(i);
    } else if (part.includes("-")) {
      const [s, e] = part.split("-").map(Number);
      if (s !== undefined && e !== undefined) {
        for (let i = s; i <= e; i++) values.push(i);
      }
    } else {
      const n = parseInt(part, 10);
      if (!isNaN(n)) values.push(n);
    }
  }
  return values;
}

function parseCron(expr: string): CronFields {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression (expected 5 fields): ${expr}`);
  }
  return {
    minute: parseField(parts[0]!, 0, 59),
    hour: parseField(parts[1]!, 0, 23),
    dayOfMonth: parseField(parts[2]!, 1, 31),
    month: parseField(parts[3]!, 1, 12),
    dayOfWeek: parseField(parts[4]!, 0, 6),
  };
}

function cronMatches(fields: CronFields, date: Date): boolean {
  return (
    fields.minute.includes(date.getMinutes()) &&
    fields.hour.includes(date.getHours()) &&
    fields.dayOfMonth.includes(date.getDate()) &&
    fields.month.includes(date.getMonth() + 1) &&
    fields.dayOfWeek.includes(date.getDay())
  );
}

function nextMatch(expr: string, after: Date): Date {
  const fields = parseCron(expr);
  const check = new Date(after);
  check.setSeconds(0, 0);
  check.setMinutes(check.getMinutes() + 1);

  // Search up to 2 years ahead
  const limit = 365 * 2 * 24 * 60;
  for (let i = 0; i < limit; i++) {
    if (cronMatches(fields, check)) return check;
    check.setMinutes(check.getMinutes() + 1);
  }
  // Fallback: 24h from now
  return new Date(after.getTime() + 86_400_000);
}

// ── CRUD ──────────────────────────────────────────────────────────────

export function createScheduledTask(
  db: DB,
  cronExpr: string,
  prompt: string,
  agentId?: string,
): number {
  // Validate cron expression
  parseCron(cronExpr);
  const nextTs = nextMatch(cronExpr, new Date()).getTime();

  const result = db
    .prepare(
      `INSERT INTO scheduled_tasks (cron_expr, prompt, agent_id, next_run_ts)
       VALUES (?, ?, ?, ?)`,
    )
    .run(cronExpr, prompt, agentId ?? null, nextTs);
  return Number(result.lastInsertRowid);
}

export interface ScheduledTaskRow {
  id: number;
  cron_expr: string;
  prompt: string;
  agent_id: string | null;
  last_run_ts: number | null;
  next_run_ts: number;
  enabled: number;
}

export function listScheduledTasks(db: DB): ScheduledTaskRow[] {
  return db
    .prepare("SELECT * FROM scheduled_tasks ORDER BY next_run_ts ASC")
    .all() as ScheduledTaskRow[];
}

export function deleteScheduledTask(db: DB, taskId: number): boolean {
  const result = db
    .prepare("DELETE FROM scheduled_tasks WHERE id = ?")
    .run(taskId);
  return result.changes > 0;
}

export function toggleScheduledTask(db: DB, taskId: number, enabled: boolean): boolean {
  const result = db
    .prepare("UPDATE scheduled_tasks SET enabled = ? WHERE id = ?")
    .run(enabled ? 1 : 0, taskId);
  return result.changes > 0;
}

// ── Tick — called every SCHEDULER_TICK_SECONDS ────────────────────────

export async function schedulerTick(
  db: DB,
  config: Config,
  defaultChatId: string,
): Promise<void> {
  const now = Date.now();
  const dueTasks = db
    .prepare(
      "SELECT * FROM scheduled_tasks WHERE enabled = 1 AND next_run_ts <= ?",
    )
    .all(now) as ScheduledTaskRow[];

  for (const task of dueTasks) {
    logger.info("scheduler: firing task", { id: task.id, prompt: task.prompt.slice(0, 100) });

    try {
      // Route through orchestrator using the task's prompt
      // If the prompt starts with @agent: it will route accordingly
      const prompt = task.agent_id
        ? `@${task.agent_id}: ${task.prompt}`
        : task.prompt;

      await orchestrate({
        db,
        config,
        chatId: defaultChatId,
        text: prompt,
      });
    } catch (err) {
      logger.error("scheduler: task failed", {
        id: task.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }

    // Update last_run_ts and compute next_run_ts
    const nextTs = nextMatch(task.cron_expr, new Date()).getTime();
    db.prepare(
      "UPDATE scheduled_tasks SET last_run_ts = ?, next_run_ts = ? WHERE id = ?",
    ).run(now, nextTs, task.id);
  }
}

// ── Scheduler loop (started from index.ts) ─────────────────────────────

let tickInterval: ReturnType<typeof setInterval> | null = null;

export function startScheduler(
  db: DB,
  config: Config,
  defaultChatId: string,
): void {
  if (tickInterval) return;

  const tickMs = config.schedulerTickSeconds * 1000;
  logger.info(`scheduler: started (tick every ${config.schedulerTickSeconds}s)`);

  tickInterval = setInterval(() => {
    void schedulerTick(db, config, defaultChatId).catch((err) => {
      logger.error("scheduler: tick error", {
        err: err instanceof Error ? err.message : String(err),
      });
    });
  }, tickMs);
}

export function stopScheduler(): void {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
    logger.info("scheduler: stopped");
  }
}

export { parseCron, cronMatches, nextMatch };
