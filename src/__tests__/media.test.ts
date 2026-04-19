import { describe, it, expect } from "vitest";
import { isMediaSupported, getMediaDescription } from "../media.js";

describe("media", () => {
  it("identifies image MIME types", () => {
    expect(isMediaSupported("image/png")).toBe(true);
    expect(isMediaSupported("image/jpeg")).toBe(true);
    expect(isMediaSupported("image/webp")).toBe(true);
  });

  it("identifies video MIME types", () => {
    expect(isMediaSupported("video/mp4")).toBe(true);
    expect(isMediaSupported("video/webm")).toBe(true);
  });

  it("identifies document MIME types", () => {
    expect(isMediaSupported("application/pdf")).toBe(true);
    expect(isMediaSupported("text/plain")).toBe(true);
  });

  it("rejects unknown MIME types", () => {
    expect(isMediaSupported("application/octet-stream")).toBe(false);
    expect(isMediaSupported("audio/mpeg")).toBe(false);
  });

  it("returns correct emoji descriptions", () => {
    expect(getMediaDescription("image/png")).toBe("📷 Image");
    expect(getMediaDescription("video/mp4")).toBe("🎥 Video");
    expect(getMediaDescription("application/pdf")).toBe("📄 Document");
    expect(getMediaDescription("application/octet-stream")).toBe("📎 Attachment");
  });
});
