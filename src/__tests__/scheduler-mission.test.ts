import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase, closeDatabase, type DB } from "../db.js";

// Import modules to register their migrations
import "../memory-ingest.js";
import "../security.js";
import "../orchestrator.js";
import "../scheduler.js";
import "../mission-cli.js";

import {
  createScheduledTask,
  listScheduledTasks,
  deleteScheduledTask,
  parseCron,
  cronMatches,
  nextMatch,
} from "../scheduler.js";

import {
  addMission,
  listMissions,
  cancelMission,
} from "../mission-cli.js";

describe("scheduler", () => {
  let db: DB;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "claudeclaw-scheduler-test-"));
    db = openDatabase(join(tmpDir, "store", "db.sqlite"));
  });

  afterEach(() => {
    closeDatabase(db);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("cron parsing", () => {
    it("parses * * * * *", () => {
      const fields = parseCron("* * * * *");
      expect(fields.minute.length).toBe(60);
      expect(fields.hour.length).toBe(24);
    });

    it("parses specific values", () => {
      const fields = parseCron("0 9 * * 1");
      expect(fields.minute).toEqual([0]);
      expect(fields.hour).toEqual([9]);
      expect(fields.dayOfWeek).toEqual([1]);
    });

    it("parses ranges", () => {
      const fields = parseCron("0 9-17 * * *");
      expect(fields.hour).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    });

    it("parses steps", () => {
      const fields = parseCron("*/15 * * * *");
      expect(fields.minute).toEqual([0, 15, 30, 45]);
    });

    it("throws on invalid expression", () => {
      expect(() => parseCron("invalid")).toThrow();
    });
  });

  describe("cronMatches", () => {
    it("matches a specific time", () => {
      const fields = parseCron("30 9 * * *");
      const d = new Date(2026, 3, 19, 9, 30); // April 19, 2026, 09:30
      expect(cronMatches(fields, d)).toBe(true);
    });

    it("rejects non-matching time", () => {
      const fields = parseCron("30 9 * * *");
      const d = new Date(2026, 3, 19, 10, 30); // 10:30 ≠ 9:30
      expect(cronMatches(fields, d)).toBe(false);
    });
  });

  describe("nextMatch", () => {
    it("returns a future date", () => {
      const now = new Date();
      const next = nextMatch("* * * * *", now);
      expect(next.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  describe("CRUD", () => {
    it("creates and lists scheduled tasks", () => {
      const id = createScheduledTask(db, "0 9 * * 1", "@research: weekly scan");
      expect(id).toBeGreaterThan(0);

      const tasks = listScheduledTasks(db);
      expect(tasks.length).toBe(1);
      expect(tasks[0]!.cron_expr).toBe("0 9 * * 1");
      expect(tasks[0]!.prompt).toBe("@research: weekly scan");
    });

    it("deletes tasks", () => {
      const id = createScheduledTask(db, "* * * * *", "test");
      expect(deleteScheduledTask(db, id)).toBe(true);
      expect(listScheduledTasks(db).length).toBe(0);
    });

    it("returns false for non-existent delete", () => {
      expect(deleteScheduledTask(db, 9999)).toBe(false);
    });
  });
});

describe("mission-cli", () => {
  let db: DB;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "claudeclaw-mission-test-"));
    db = openDatabase(join(tmpDir, "store", "db.sqlite"));
  });

  afterEach(() => {
    closeDatabase(db);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("adds missions with priority ordering", () => {
    addMission(db, "low priority task", 3);
    addMission(db, "high priority task", 8);
    addMission(db, "mid priority task", 5);

    const tasks = listMissions(db);
    expect(tasks.length).toBe(3);
    // Should be ordered by priority DESC
    expect(tasks[0]!.priority).toBe(8);
    expect(tasks[1]!.priority).toBe(5);
    expect(tasks[2]!.priority).toBe(3);
  });

  it("filters by status", () => {
    addMission(db, "task1", 5);
    addMission(db, "task2", 5);

    const queued = listMissions(db, "queued");
    expect(queued.length).toBe(2);

    const done = listMissions(db, "done");
    expect(done.length).toBe(0);
  });

  it("cancels a queued mission", () => {
    const id = addMission(db, "cancel me", 5);
    expect(cancelMission(db, id)).toBe(true);

    const tasks = listMissions(db, "failed");
    expect(tasks.length).toBe(1);
    expect(tasks[0]!.id).toBe(id);
  });

  it("cannot cancel a completed mission", () => {
    const id = addMission(db, "done task", 5);
    // Manually mark as done
    db.prepare("UPDATE mission_tasks SET status = 'done' WHERE id = ?").run(id);
    expect(cancelMission(db, id)).toBe(false);
  });

  it("assigns agent when specified", () => {
    addMission(db, "research task", 7, "research");
    const tasks = listMissions(db);
    expect(tasks[0]!.agent_id).toBe("research");
  });
});
