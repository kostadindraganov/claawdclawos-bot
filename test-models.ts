import { loadConfig } from "./src/config.js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const envPath = resolve(__dirname, ".env");
const config = loadConfig(envPath);

async function run() {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?key=" + config.googleApiKey);
  const data = await res.json();
  const models = data.models.map((m: any) => ({ name: m.name, methods: m.supportedGenerationMethods }));
  console.log(JSON.stringify(models, null, 2));
}
run();
