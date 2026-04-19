import { describe, it, expect } from "vitest";
import { speechToText, textToSpeech } from "../voice.js";

describe("voice cascade", () => {
  describe("STT", () => {
    it("throws when no providers are configured", async () => {
      const buf = Buffer.from("fake audio data");
      await expect(
        speechToText(buf, undefined, undefined),
      ).rejects.toThrow("All STT providers failed");
    });
  });

  describe("TTS", () => {
    if (process.platform === "darwin") {
      it("falls back to macOS say when no cloud providers configured", async () => {
        const result = await textToSpeech("test", {});
        expect(result.provider).toBe("say");
        expect(result.audioBuffer.length).toBeGreaterThan(0);
        expect(result.durationMs).toBeGreaterThan(0);
      });

      it("macOS say generates audio for longer text", async () => {
        const result = await textToSpeech("Hello, this is a voice test from ClaudeClaw OS.", {});
        expect(result.provider).toBe("say");
        expect(result.audioBuffer.length).toBeGreaterThan(100);
      });
    } else {
      it("throws when no providers are configured on non-macOS", async () => {
        await expect(
          textToSpeech("hello", {}),
        ).rejects.toThrow();
      });
    }
  });
});
