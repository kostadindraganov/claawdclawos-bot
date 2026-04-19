import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import { logger } from "./logger.js";

const clients = new Map<string, GoogleGenerativeAI>();
const flashModels = new Map<string, GenerativeModel>();
const embeddingModels = new Map<string, GenerativeModel>();

function getClient(apiKey: string): GoogleGenerativeAI {
  let c = clients.get(apiKey);
  if (!c) {
    c = new GoogleGenerativeAI(apiKey);
    clients.set(apiKey, c);
  }
  return c;
}

export function getFlashModel(apiKey: string, modelName: string): GenerativeModel {
  const key = `${apiKey}::${modelName}`;
  let m = flashModels.get(key);
  if (!m) {
    m = getClient(apiKey).getGenerativeModel({ model: modelName });
    flashModels.set(key, m);
  }
  return m;
}

export function getEmbeddingModel(apiKey: string): GenerativeModel {
  let m = embeddingModels.get(apiKey);
  if (!m) {
    // text-embedding-004 produces 768-dim vectors per spec
    m = getClient(apiKey).getGenerativeModel({ model: "gemini-embedding-001" });
    embeddingModels.set(apiKey, m);
  }
  return m;
}

export async function generateText(
  apiKey: string,
  modelName: string,
  prompt: string,
): Promise<string> {
  const model = getFlashModel(apiKey, modelName);
  const result = await model.generateContent(prompt);
  return result.response.text();
}

export async function generateJson<T>(
  apiKey: string,
  modelName: string,
  prompt: string,
): Promise<T> {
  const raw = await generateText(apiKey, modelName, prompt);

  // Strip markdown code fences if present
  const stripped = raw
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();

  try {
    return JSON.parse(stripped) as T;
  } catch {
    // Try to extract the first JSON array or object
    const arrayMatch = stripped.match(/(\[[\s\S]*\])/);
    const objectMatch = stripped.match(/(\{[\s\S]*\})/);
    const match = arrayMatch ?? objectMatch;
    if (match?.[1]) return JSON.parse(match[1]) as T;
    logger.warn("gemini: failed to parse JSON response", { raw });
    throw new Error(`Gemini returned non-JSON: ${raw.slice(0, 200)}`);
  }
}

export async function embedText(
  apiKey: string,
  text: string,
): Promise<number[]> {
  const model = getEmbeddingModel(apiKey);
  const result = await model.embedContent(text);
  return result.embedding.values;
}
