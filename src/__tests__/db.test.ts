import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase, closeDatabase } from "../db.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `claudeclaw-db-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ok */ }
});

describe("openDatabase", () => {
  it("creates the sessions table", () => {
    const db = openDatabase(join(tmpDir, "store", "db.sqlite"));
    const rows = db.pragma("table_info(sessions)") as Array<{ name: string }>;
    const cols = rows.map((r) => r.name);
    expect(cols).toContain("chat_id");
    expect(cols).toContain("agent_id");
    expect(cols).toContain("session_id");
    expect(cols).toContain("last_seen_ts");
    closeDatabase(db);
  });

  it("enables WAL journal mode", () => {
    const db = openDatabase(join(tmpDir, "store", "db.sqlite"));
    const [row] = db.pragma("journal_mode") as Array<{ journal_mode: string }>;
    expect(row?.journal_mode).toBe("wal");
    closeDatabase(db);
  });

  it("auto-creates the store directory", () => {
    // Nested path that does not exist yet
    const path = join(tmpDir, "deep", "nested", "db.sqlite");
    const db = openDatabase(path);
    expect(db).toBeDefined();
    closeDatabase(db);
  });

  it("creates all 9 required tables from migrations", async () => {
    // Note: We need to import the migration modules so they register their migrations
    // before openDatabase is executed to verify all tables.
    await import("../memory-ingest.js");
    await import("../security.js");
    await import("../orchestrator.js");
    await import("../dashboard.js");
    await import("../mission-cli.js");

    const path = join(tmpDir, "store", "db_migrations_test.sqlite");
    const db = openDatabase(path);

    const tables = [
      "sessions",
      "memories",
      "memories_fts",
      "hive_mind",
      "scheduled_tasks",
      "mission_tasks",
      "audit_log",
      "warroom_transcript",
      "meet_sessions",
    ];

    for (const table of tables) {
      const exists = db
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
        .get(table) !== undefined;
      expect(exists).toBe(true);
    }
    closeDatabase(db);
  });

  it("upserts and reads session rows", () => {
    const db = openDatabase(join(tmpDir, "store", "db.sqlite"));

    db.prepare(
      `INSERT INTO sessions (chat_id, agent_id, session_id, last_seen_ts)
       VALUES ('c1', 'main', 'sess-abc', 1000)
       ON CONFLICT (chat_id, agent_id)
       DO UPDATE SET session_id = excluded.session_id, last_seen_ts = excluded.last_seen_ts`,
    ).run();

    const row = db
      .prepare("SELECT session_id FROM sessions WHERE chat_id='c1' AND agent_id='main'")
      .get() as { session_id: string };
    expect(row?.session_id).toBe("sess-abc");

    closeDatabase(db);
  });
});
