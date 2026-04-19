import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

export type EnvMap = Record<string, string>;

export function readEnvFile(path: string = resolve(PROJECT_ROOT, ".env")): EnvMap {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    return {};
  }

  const env: EnvMap = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    const raw_val = trimmed.slice(eqIdx + 1).trim();

    // Strip surrounding quotes
    const val =
      (raw_val.startsWith('"') && raw_val.endsWith('"')) ||
      (raw_val.startsWith("'") && raw_val.endsWith("'"))
        ? raw_val.slice(1, -1)
        : raw_val;

    // Strip inline comments (outside of quoted values)
    const commentIdx = val.indexOf(" #");
    env[key] = commentIdx === -1 ? val : val.slice(0, commentIdx).trim();
  }

  return env;
}
