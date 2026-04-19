import { type DB } from "./db.js";
import { embed, unpackEmbedding, cosineSimilarity } from "./embeddings.js";
import { maybeDecrypt, deriveKey } from "./crypto.js";
import { logger } from "./logger.js";

const DEFAULT_SEMANTIC_K = 8;
const DEFAULT_FTS_K = 5;
const TOKEN_BUDGET = 4_000;

interface MemoryRow {
  id: number;
  kind: string;
  content: string;
  embedding: Buffer | null;
  salience: number;
  pinned: number;
  created_ts: number;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function sanitizeFtsQuery(query: string): string {
  // Escape FTS5 special characters to avoid parse errors
  return query.replace(/['"*^()]/g, " ").trim();
}

function formatRow(row: MemoryRow, encKey: Buffer | null): string {
  const content = maybeDecrypt(row.content, encKey);
  return `[${row.kind}] ${content}`;
}

export interface MemoryContextOptions {
  db: DB;
  chatId: string;
  queryText: string;
  googleApiKey: string;
  encryptionKey?: string;
  tokenBudget?: number;
}

export async function buildMemoryContext(
  opts: MemoryContextOptions,
): Promise<string> {
  const { db, chatId, queryText, googleApiKey, encryptionKey } = opts;
  const budget = opts.tokenBudget ?? TOKEN_BUDGET;

  if (!googleApiKey) return "";

  const encKey = encryptionKey ? deriveKey(encryptionKey) : null;
  const seen = new Set<number>();
  const lines: string[] = [];
  let usedTokens = 0;

  function addRow(row: MemoryRow): boolean {
    if (seen.has(row.id)) return false;
    const line = formatRow(row, encKey);
    const cost = estimateTokens(line);
    if (usedTokens + cost > budget) return false;
    seen.add(row.id);
    lines.push(line);
    usedTokens += cost;
    return true;
  }

  // Layer 1: semantic vector search
  try {
    const queryEmb = await embed(queryText, googleApiKey);
    const allRows = db
      .prepare(
        "SELECT id, kind, content, embedding, salience, pinned, created_ts FROM memories WHERE chat_id=? AND embedding IS NOT NULL",
      )
      .all(chatId) as MemoryRow[];

    const scored = allRows
      .map((row) => ({
        row,
        score: cosineSimilarity(queryEmb, unpackEmbedding(row.embedding!)),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, DEFAULT_SEMANTIC_K);

    for (const { row } of scored) addRow(row);
  } catch (err) {
    logger.warn("memory: layer1 semantic search failed", { err });
  }

  // Layer 2: FTS5 keyword search
  try {
    const safeQ = sanitizeFtsQuery(queryText);
    if (safeQ) {
      const ftsRows = db
        .prepare(
          `SELECT m.id, m.kind, m.content, m.embedding, m.salience, m.pinned, m.created_ts
           FROM memories m
           JOIN memories_fts ON m.id = memories_fts.rowid
           WHERE memories_fts MATCH ? AND m.chat_id = ?
           LIMIT ?`,
        )
        .all(safeQ, chatId, DEFAULT_FTS_K) as MemoryRow[];
      for (const row of ftsRows) addRow(row);
    }
  } catch (err) {
    logger.warn("memory: layer2 FTS search failed", { err });
  }

  // Layer 3: recent high-importance (last 24 h, salience >= 4 or pinned)
  const dayAgo = Date.now() - 86_400_000;
  const highRows = db
    .prepare(
      `SELECT id, kind, content, embedding, salience, pinned, created_ts FROM memories
       WHERE chat_id=? AND (salience >= 4 OR pinned=1) AND created_ts >= ?
       ORDER BY salience DESC LIMIT 10`,
    )
    .all(chatId, dayAgo) as MemoryRow[];
  for (const row of highRows) addRow(row);

  // Layer 4: consolidation insights (always include)
  const insightRows = db
    .prepare(
      `SELECT id, kind, content, embedding, salience, pinned, created_ts FROM memories
       WHERE chat_id=? AND kind='insight'
       ORDER BY salience DESC LIMIT 10`,
    )
    .all(chatId) as MemoryRow[];
  for (const row of insightRows) addRow(row);

  // Layer 5: conversation history is maintained by Claude SDK session resumption
  // (no explicit injection needed — session resume carries it)

  if (lines.length === 0) return "";

  return `[Memory Context — ${lines.length} items]\n${lines.join("\n")}`;
}

export function searchMemories(
  db: DB,
  chatId: string,
  query: string,
  encryptionKey?: string,
  limit = 20,
): Array<{ id: number; kind: string; content: string; salience: number }> {
  const encKey = encryptionKey ? deriveKey(encryptionKey) : null;
  const safeQ = sanitizeFtsQuery(query);
  if (!safeQ) return [];

  const rows = db
    .prepare(
      `SELECT m.id, m.kind, m.content, m.salience
       FROM memories m
       JOIN memories_fts f ON m.id = f.rowid
       WHERE memories_fts MATCH ? AND m.chat_id = ?
       ORDER BY m.salience DESC LIMIT ?`,
    )
    .all(safeQ, chatId, limit) as Array<{
      id: number;
      kind: string;
      content: string;
      salience: number;
    }>;

  return rows.map((r) => ({
    ...r,
    content: maybeDecrypt(r.content, encKey),
  }));
}
