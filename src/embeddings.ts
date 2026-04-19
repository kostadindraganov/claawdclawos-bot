import { embedText } from "./gemini.js";

const EMBEDDING_DIM = 768;

// Simple LRU cache using Map (insertion-order iteration)
class LRUCache<V> {
  private readonly cache = new Map<string, V>();
  constructor(private readonly maxSize: number) {}

  get(key: string): V | undefined {
    const val = this.cache.get(key);
    if (val !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, val);
    }
    return val;
  }

  set(key: string, val: V): void {
    if (this.cache.has(key)) this.cache.delete(key);
    else if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, val);
  }

  size(): number {
    return this.cache.size;
  }
}

const cache = new LRUCache<Float32Array>(1000);

export async function embed(text: string, apiKey: string): Promise<Float32Array> {
  const cached = cache.get(text);
  if (cached) return cached;

  const values = await embedText(apiKey, text);
  const arr = new Float32Array(values);
  cache.set(text, arr);
  return arr;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export function packEmbedding(emb: Float32Array): Buffer {
  const buf = Buffer.allocUnsafe(emb.length * 4);
  for (let i = 0; i < emb.length; i++) {
    buf.writeFloatLE(emb[i] ?? 0, i * 4);
  }
  return buf;
}

export function unpackEmbedding(blob: Buffer): Float32Array {
  const elements = blob.length / 4;
  const arr = new Float32Array(elements);
  for (let i = 0; i < elements; i++) {
    arr[i] = blob.readFloatLE(i * 4);
  }
  return arr;
}

export function cacheSize(): number {
  return cache.size();
}
