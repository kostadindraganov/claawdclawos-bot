import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { logger } from "./logger.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// ── STT Cascade ────────────────────────────────────────────────────────

export interface STTResult {
  text: string;
  provider: "groq" | "whisper-cpp";
  durationMs: number;
}

async function sttGroq(
  audioBuffer: Buffer,
  apiKey: string,
): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: "audio/ogg" });
  formData.append("file", blob, "audio.ogg");
  formData.append("model", "whisper-large-v3");
  formData.append("response_format", "text");

  const resp = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!resp.ok) {
    throw new Error(`Groq STT failed: ${resp.status} ${await resp.text()}`);
  }

  return (await resp.text()).trim();
}

async function sttWhisperCpp(
  audioBuffer: Buffer,
  modelPath: string,
): Promise<string> {
  // Write audio to temp file
  const tmpFile = join(tmpdir(), `claudeclaw-stt-${randomBytes(4).toString("hex")}.wav`);
  writeFileSync(tmpFile, audioBuffer);

  try {
    const result = await new Promise<string>((resolve, reject) => {
      execFile(
        "whisper-cpp",
        ["--model", modelPath, "--output-txt", "--no-timestamps", tmpFile],
        { timeout: 30_000 },
        (err, stdout, stderr) => {
          if (err) reject(new Error(`whisper-cpp failed: ${stderr || err.message}`));
          else resolve(stdout.trim());
        },
      );
    });
    return result;
  } finally {
    try { unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

export async function speechToText(
  audioBuffer: Buffer,
  groqApiKey?: string,
  whisperModelPath?: string,
): Promise<STTResult> {
  const start = Date.now();

  // Try Groq Whisper first
  if (groqApiKey) {
    try {
      const text = await sttGroq(audioBuffer, groqApiKey);
      return { text, provider: "groq", durationMs: Date.now() - start };
    } catch (err) {
      logger.warn("voice: Groq STT failed, falling back", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Fallback: whisper-cpp
  if (whisperModelPath && existsSync(whisperModelPath)) {
    try {
      const text = await sttWhisperCpp(audioBuffer, whisperModelPath);
      return { text, provider: "whisper-cpp", durationMs: Date.now() - start };
    } catch (err) {
      logger.warn("voice: whisper-cpp STT failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  throw new Error("All STT providers failed");
}

// ── TTS Cascade ────────────────────────────────────────────────────────

export interface TTSResult {
  audioBuffer: Buffer;
  provider: "elevenlabs" | "gradium" | "kokoro" | "say";
  durationMs: number;
}

async function ttsElevenLabs(
  text: string,
  apiKey: string,
): Promise<Buffer> {
  const resp = await fetch(
    "https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    },
  );

  if (!resp.ok) {
    throw new Error(`ElevenLabs TTS failed: ${resp.status}`);
  }

  return Buffer.from(await resp.arrayBuffer());
}

async function ttsGradium(
  text: string,
  apiKey: string,
): Promise<Buffer> {
  const resp = await fetch("https://api.gradium.ai/v1/tts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ text, voice: "default" }),
  });

  if (!resp.ok) {
    throw new Error(`Gradium TTS failed: ${resp.status}`);
  }

  return Buffer.from(await resp.arrayBuffer());
}

async function ttsKokoro(
  text: string,
  kokoroUrl: string,
): Promise<Buffer> {
  const resp = await fetch(`${kokoroUrl}/v1/audio/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: text,
      voice: "af_heart",
      model: "kokoro",
      response_format: "mp3",
    }),
  });

  if (!resp.ok) {
    throw new Error(`Kokoro TTS failed: ${resp.status}`);
  }

  return Buffer.from(await resp.arrayBuffer());
}

async function ttsMacSay(text: string): Promise<Buffer> {
  const tmpFile = join(tmpdir(), `claudeclaw-tts-${randomBytes(4).toString("hex")}.aiff`);

  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        "say",
        ["-o", tmpFile, text.slice(0, 5000)],
        { timeout: 30_000 },
        (err) => {
          if (err) reject(new Error(`macOS say failed: ${err.message}`));
          else resolve();
        },
      );
    });
    return readFileSync(tmpFile);
  } finally {
    try { unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

export interface TTSOptions {
  elevenLabsApiKey?: string;
  gradiumApiKey?: string;
  kokoroUrl?: string;
}

export async function textToSpeech(
  text: string,
  opts: TTSOptions,
): Promise<TTSResult> {
  const start = Date.now();

  // 1. ElevenLabs
  if (opts.elevenLabsApiKey) {
    try {
      const buf = await ttsElevenLabs(text, opts.elevenLabsApiKey);
      return { audioBuffer: buf, provider: "elevenlabs", durationMs: Date.now() - start };
    } catch (err) {
      logger.warn("voice: ElevenLabs TTS failed, falling back", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 2. Gradium
  if (opts.gradiumApiKey) {
    try {
      const buf = await ttsGradium(text, opts.gradiumApiKey);
      return { audioBuffer: buf, provider: "gradium", durationMs: Date.now() - start };
    } catch (err) {
      logger.warn("voice: Gradium TTS failed, falling back", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 3. Kokoro (local)
  if (opts.kokoroUrl) {
    try {
      const buf = await ttsKokoro(text, opts.kokoroUrl);
      return { audioBuffer: buf, provider: "kokoro", durationMs: Date.now() - start };
    } catch (err) {
      logger.warn("voice: Kokoro TTS failed, falling back", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 4. macOS `say` (final fallback)
  if (process.platform === "darwin") {
    try {
      const buf = await ttsMacSay(text);
      return { audioBuffer: buf, provider: "say", durationMs: Date.now() - start };
    } catch (err) {
      logger.warn("voice: macOS say failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  throw new Error("All TTS providers failed (voice-fallback-failed)");
}
