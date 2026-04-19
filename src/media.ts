import { readFileSync } from "node:fs";
import { generateText } from "./gemini.js";
import { logger } from "./logger.js";

// ── Media analysis via Gemini ──────────────────────────────────────────

export interface MediaAnalysisResult {
  description: string;
  type: "image" | "video" | "document" | "unknown";
  durationMs: number;
}

export async function analyzeMedia(
  filePath: string,
  mimeType: string,
  googleApiKey: string,
  geminiModel: string,
): Promise<MediaAnalysisResult> {
  const start = Date.now();

  const mediaType = categorizeMedia(mimeType);

  if (mediaType === "unknown") {
    return {
      description: `Unsupported media type: ${mimeType}`,
      type: "unknown",
      durationMs: Date.now() - start,
    };
  }

  try {
    const fileBuffer = readFileSync(filePath);
    const base64 = fileBuffer.toString("base64");

    let prompt: string;
    switch (mediaType) {
      case "image":
        prompt = `Analyze this image in detail. Describe:\n1. What the image shows\n2. Key elements and objects\n3. Any text visible\n4. Overall context/setting\n\nBe concise but thorough.`;
        break;
      case "video":
        prompt = `Analyze this video. Describe:\n1. What is happening in the video\n2. Key visual elements\n3. Any text or captions\n4. Duration and context\n\nBe concise but thorough.`;
        break;
      case "document":
        prompt = `Analyze this document. Extract and summarize:\n1. Key content and information\n2. Document type and format\n3. Important details\n\nBe concise but thorough.`;
        break;
    }

    // Use Gemini's multimodal capabilities
    const description = await generateText(
      googleApiKey,
      geminiModel,
      `${prompt}\n\n[Media attached: ${mimeType}, ${fileBuffer.length} bytes, base64: ${base64.slice(0, 100)}...]`,
    );

    return {
      description,
      type: mediaType,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    logger.error("media: analysis failed", {
      err: err instanceof Error ? err.message : String(err),
      mimeType,
    });
    return {
      description: `Failed to analyze media (${mimeType}): ${err instanceof Error ? err.message : String(err)}`,
      type: mediaType,
      durationMs: Date.now() - start,
    };
  }
}

function categorizeMedia(mimeType: string): MediaAnalysisResult["type"] {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (
    mimeType === "application/pdf" ||
    mimeType.startsWith("text/") ||
    mimeType.includes("document")
  ) {
    return "document";
  }
  return "unknown";
}

export function isMediaSupported(mimeType: string): boolean {
  return categorizeMedia(mimeType) !== "unknown";
}

export function getMediaDescription(mimeType: string): string {
  const type = categorizeMedia(mimeType);
  switch (type) {
    case "image":
      return "📷 Image";
    case "video":
      return "🎥 Video";
    case "document":
      return "📄 Document";
    default:
      return "📎 Attachment";
  }
}
