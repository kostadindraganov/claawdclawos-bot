import { loadConfig } from "./src/config.js";
import { getEmbeddingModel, getFlashModel } from "./src/gemini.js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const envPath = resolve(__dirname, ".env");
const config = loadConfig(envPath);

async function run() {
  console.log("Testing text-embedding-004...");
  try {
    const res1 = await getEmbeddingModel(config.googleApiKey!).embedContent("Hello world");
    console.log("Embedding SUCCESS:", res1.embedding.values.length);
  } catch (e: any) {
    console.error("Embedding FAIL:", e.status, e.statusText, e.message);
  }

  console.log("Testing gemini-2.0-flash...");
  try {
    const res2 = await getFlashModel(config.googleApiKey!, config.geminiFlashModel).generateContent("Hello?");
    console.log("Flash SUCCESS:", res2.response.text().slice(0, 50));
  } catch (e: any) {
    console.error("Flash FAIL:", e.status, e.statusText, e.message);
  }
}
run();
