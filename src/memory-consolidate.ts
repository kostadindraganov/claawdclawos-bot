import { type DB } from "./db.js";
import { generateJson } from "./gemini.js";
import { unpackEmbedding, embed, packEmbedding, cosineSimilarity } from "./embeddings.js";
import { maybeEncrypt, maybeDecrypt, deriveKey } from "./crypto.js";
import { logger } from "./logger.js";

interface MemoryRow {
  id: number;
  kind: string;
  content: string;
  embedding: Buffer | null;
  salience: number;
  pinned: number;
  updated_ts: number;
}

// Decay rates per salience tier (per-day exponential decay)
const DECAY_RATE: Record<string, number> = {
  pinned: 0.0,
  high: 0.01,   // salience >= 4
  mid: 0.02,    // salience 2–3.99
  low: 0.05,    // salience < 2
};

function decayRate(row: MemoryRow): number {
  if (row.pinned) return DECAY_RATE["pinned"] ?? 0;
  if (row.salience >= 4) return DECAY_RATE["high"] ?? 0.01;
  if (row.salience >= 2) return DECAY_RATE["mid"] ?? 0.02;
  return DECAY_RATE["low"] ?? 0.05;
}

function applyDecay(rows: MemoryRow[]): Map<number, number> {
  const now = Date.now();
  const updates = new Map<number, number>();
  for (const row of rows) {
    const rate = decayRate(row);
    if (rate === 0) continue;
    const daysSince = (now - row.updated_ts) / 86_400_000;
    const newSalience = row.salience * Math.exp(-rate * daysSince);
    updates.set(row.id, newSalience);
  }
  return updates;
}

const MERGE_PROMPT = (items: string[]) => `
These memories are very similar. Merge them into a single, clearer, more concise memory.
Return a JSON object with:
  "kind": "fact" | "preference" | "insight" | "task_note"
  "content": string — the merged, clear statement
  "salience": number 0–5 (use the maximum from the originals)
  "pinned": boolean (true if any original was pinned)

Originals:
${items.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Return only valid JSON.
`.trim();

export async function consolidate(
  db: DB,
  googleApiKey: string,
  geminiModel: string,
  encryptionKey?: string,
): Promise<void> {
  if (!googleApiKey) return;

  const encKey = encryptionKey ? deriveKey(encryptionKey) : null;

  const rows = db
    .prepare("SELECT id, kind, content, embedding, salience, pinned, updated_ts FROM memories")
    .all() as MemoryRow[];

  if (rows.length === 0) return;

  // 1. Apply decay
  const decayUpdates = applyDecay(rows);
  const updateStmt = db.prepare("UPDATE memories SET salience=?, updated_ts=? WHERE id=?");
  const now = Date.now();
  for (const [id, newSal] of decayUpdates) {
    updateStmt.run(newSal, now, id);
  }

  // 2. Prune rows below threshold (salience < 0.1, not pinned)
  const pruned = db
    .prepare("DELETE FROM memories WHERE salience < 0.1 AND pinned = 0")
    .run();
  if (pruned.changes > 0) {
    logger.info("consolidate: pruned low-salience memories", { count: pruned.changes });
  }

  // 3. Merge near-duplicate memories
  const fresh = db
    .prepare("SELECT id, kind, content, embedding, salience, pinned, updated_ts FROM memories")
    .all() as MemoryRow[];

  const merged = new Set<number>();
  const groups: MemoryRow[][] = [];

  for (let i = 0; i < fresh.length; i++) {
    const a = fresh[i];
    if (!a || merged.has(a.id) || !a.embedding) continue;
    const group = [a];
    const embA = unpackEmbedding(a.embedding);

    for (let j = i + 1; j < fresh.length; j++) {
      const b = fresh[j];
      if (!b || merged.has(b.id) || !b.embedding) continue;
      const embB = unpackEmbedding(b.embedding);
      if (cosineSimilarity(embA, embB) > 0.92) {
        group.push(b);
        merged.add(b.id);
      }
    }

    if (group.length > 1) {
      merged.add(a.id);
      groups.push(group);
    }
  }

  for (const group of groups) {
    const contents = group.map((r) => maybeDecrypt(r.content, encKey));
    try {
      const merged_mem = await generateJson<{
        kind: string;
        content: string;
        salience: number;
        pinned: boolean;
      }>(googleApiKey, geminiModel, MERGE_PROMPT(contents));

      const maxSalience = Math.max(...group.map((r) => r.salience));
      const anyPinned = group.some((r) => r.pinned === 1);
      const salience = Math.max(0, Math.min(5, merged_mem.salience ?? maxSalience));

      let embBlob: Buffer | null = null;
      try {
        const embArr = await embed(merged_mem.content, googleApiKey);
        embBlob = packEmbedding(embArr);
      } catch { /* non-fatal */ }

      const encContent = maybeEncrypt(merged_mem.content, encKey);

      // Delete originals and insert merged
      const ids = group.map((r) => r.id);
      db.prepare(`DELETE FROM memories WHERE id IN (${ids.map(() => "?").join(",")})`).run(...ids);

      db.prepare(`
        INSERT INTO memories (chat_id, agent_id, kind, content, embedding, salience, pinned, created_ts, updated_ts)
        SELECT chat_id, agent_id, ?, ?, ?, ?, ?, ?, ?
        FROM (SELECT chat_id, agent_id FROM memories WHERE id = ? LIMIT 1)
      `).run(
        merged_mem.kind ?? "insight",
        encContent,
        embBlob,
        salience,
        anyPinned ? 1 : 0,
        now,
        now,
        group[0]!.id,
      );

      logger.debug("consolidate: merged memories", { count: group.length });
    } catch (err) {
      logger.warn("consolidate: merge failed", { err });
    }
  }

  logger.info("consolidate: done", {
    decayed: decayUpdates.size,
    merged: groups.length,
  });
}
