import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { logger } from "./logger.js";

export type DB = Database.Database;

function ensureDir(dbPath: string): void {
  mkdirSync(dirname(dbPath), { recursive: true });
}

function hasColumn(db: DB, table: string, column: string): boolean {
  const rows = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

function tableExists(db: DB, table: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
    .get(table);
  return row !== undefined;
}

function migrate(db: DB): void {
  // sessions: composite primary key (chat_id, agent_id)
  if (!tableExists(db, "sessions")) {
    db.exec(`
      CREATE TABLE sessions (
        chat_id     TEXT NOT NULL,
        agent_id    TEXT NOT NULL,
        session_id  TEXT NOT NULL,
        last_seen_ts INTEGER NOT NULL,
        PRIMARY KEY (chat_id, agent_id)
      );
    `);
    logger.info("db: created sessions table");
  }

  // Phase 2+ tables are applied by their respective modules via addMigration()
  for (const [name, sql] of pendingMigrations) {
    if (!tableExists(db, name)) {
      db.exec(sql);
      logger.info(`db: applied migration for table ${name}`);
    }
  }

  // Column-level migrations
  for (const { table, column, sql } of pendingColumnMigrations) {
    if (tableExists(db, table) && !hasColumn(db, table, column)) {
      db.exec(sql);
      logger.info(`db: added column ${table}.${column}`);
    }
  }

  // Raw migrations (virtual tables, triggers, indexes)
  for (const m of pendingRawMigrations) {
    if (!m.check(db)) {
      db.exec(m.sql);
      logger.info(`db: applied raw migration ${m.name}`);
    }
  }
}

interface ColumnMigration {
  table: string;
  column: string;
  sql: string;
}

interface RawMigration {
  name: string;
  check: (db: DB) => boolean;
  sql: string;
}

const pendingMigrations: Map<string, string> = new Map();
const pendingColumnMigrations: ColumnMigration[] = [];
const pendingRawMigrations: RawMigration[] = [];

export function addMigration(tableName: string, createSql: string): void {
  pendingMigrations.set(tableName, createSql);
}

export function addColumnMigration(migration: ColumnMigration): void {
  pendingColumnMigrations.push(migration);
}

export function addRawMigration(
  name: string,
  check: (db: DB) => boolean,
  sql: string,
): void {
  pendingRawMigrations.push({ name, check, sql });
}

export function objectExists(
  db: DB,
  type: "trigger" | "index" | "view",
  name: string,
): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type=? AND name=?")
    .get(type, name);
  return row !== undefined;
}

export function openDatabase(dbPath: string): DB {
  ensureDir(dbPath);

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");

  migrate(db);
  logger.info(`db: open at ${dbPath}`);
  return db;
}

export function closeDatabase(db: DB): void {
  db.close();
  logger.info("db: closed");
}
