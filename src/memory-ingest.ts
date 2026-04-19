import { addMigration, addRawMigration, objectExists, type DB } from "./db.js";
import { generateJson } from "./gemini.js";
import { embed, packEmbedding } from "./embeddings.js";
import { maybeEncrypt, deriveKey } from "./crypto.js";
import { logger } from "./logger.js";

// Register migrations at module load time — must be imported before openDatabase()
addMigration(
  "memories",
  `CREATE TABLE memories (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id      TEXT NOT NULL,
    agent_id     TEXT,
    kind         TEXT NOT NULL CHECK(kind IN ('fact','preference','insight','task_note')),
    content      TEXT NOT NULL,
    embedding    BLOB,
    salience     REAL NOT NULL DEFAULT 3.0,
    pinned       INTEGER NOT NULL DEFAULT 0,
    created_ts   INTEGER NOT NULL,
    updated_ts   INTEGER NOT NULL,
    expires_ts   INTEGER
  );`,
);

addRawMigration(
  "memories_fts",
  (db) => {
    const row = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='memories_fts'")
      .get();
    return row !== undefined;
  },
  `CREATE VIRTUAL TABLE memories_fts USING fts5(
    content,
    content='memories',
    content_rowid='id'
  );`,
);

addRawMigration(
  "memories_ai",
  (db) => objectExists(db, "trigger", "memories_ai"),
  `CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
    INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
  END;`,
);

addRawMigration(
  "memories_ad",
  (db) => objectExists(db, "trigger", "memories_ad"),
  `CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, content) VALUES ('delete', old.id, old.content);
  END;`,
);

addRawMigration(
  "memories_au",
  (db) => objectExists(db, "trigger", "memories_au"),
  `CREATE TRIGGER memories_au AFTER UPDATE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, content) VALUES ('delete', old.id, old.content);
    INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
  END;`,
);

interface ExtractedMemory {
  kind: "fact" | "preference" | "insight" | "task_note";
  content: string;
  salience: number;
  pinned: boolean;
}

const EXTRACTION_PROMPT = (userMsg: string, assistantReply: string) => `
Analyze this conversation turn and extract memorable facts, preferences, or insights worth remembering long-term.
Return a JSON array. Each item must have:
  "kind": "fact" | "preference" | "insight" | "task_note"
  "content": string — a clear, standalone statement (not relative to this conversation)
  "salience": number 0–5 (5 = critically important, 0 = barely notable)
  "pinned": boolean — true only for things that must never be forgotten

Only include genuinely memorable information. Skip small talk, greetings, and transient details.
If there is nothing worth remembering, return an empty array [].

User: ${userMsg}
Assistant: ${assistantReply}

Return only valid JSON, no markdown fences.
`.trim();

export interface IngestOptions {
  db: DB;
  chatId: string;
  agentId: string;
  userMessage: string;
  assistantReply: string;
  googleApiKey: string;
  geminiModel: string;
  encryptionKey?: string;
}

export async function ingestMemory(opts: IngestOptions): Promise<void> {
  const {
    db,
    chatId,
    agentId,
    userMessage,
    assistantReply,
    googleApiKey,
    geminiModel,
    encryptionKey,
  } = opts;

  if (!googleApiKey) return;

  let memories: ExtractedMemory[];
  try {
    memories = await generateJson<ExtractedMemory[]>(
      googleApiKey,
      geminiModel,
      EXTRACTION_PROMPT(userMessage, assistantReply),
    );
    if (!Array.isArray(memories)) return;
  } catch (err) {
    logger.warn("memory-ingest: extraction failed", { err });
    return;
  }

  const encKey = encryptionKey ? deriveKey(encryptionKey) : null;
  const now = Date.now();

  const insert = db.prepare(`
    INSERT INTO memories (chat_id, agent_id, kind, content, embedding, salience, pinned, created_ts, updated_ts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const mem of memories) {
    if (!mem.content?.trim()) continue;
    const salience = Math.max(0, Math.min(5, mem.salience ?? 3));

    let embBlob: Buffer | null = null;
    try {
      const embArr = await embed(mem.content, googleApiKey);
      embBlob = packEmbedding(embArr);
    } catch {
      // Non-fatal: store without embedding
    }

    const encContent = maybeEncrypt(mem.content, encKey);
    insert.run(
      chatId,
      agentId,
      mem.kind,
      encContent,
      embBlob,
      salience,
      mem.pinned ? 1 : 0,
      now,
      now,
    );
  }

  if (memories.length > 0) {
    logger.debug("memory-ingest: stored memories", { chatId, count: memories.length });
  }
}
