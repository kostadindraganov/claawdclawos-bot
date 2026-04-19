import { describe, it, expect } from "vitest";
import { scanForSecrets } from "../exfiltration-guard.js";

describe("exfiltration-guard (full pattern suite)", () => {
  it("redacts Anthropic/OpenAI keys", () => {
    const r = scanForSecrets("my key is sk-1234567890abcdefghij");
    expect(r.clean).toContain("[REDACTED]");
    expect(r.matches).toContain("anthropic/openai-key");
  });

  it("redacts Google API keys", () => {
    const r = scanForSecrets("key: AIzaSyA1234567890abcdefgh");
    expect(r.clean).toContain("[REDACTED]");
    expect(r.matches).toContain("google-api-key");
  });

  it("redacts GitHub PATs (classic)", () => {
    const r = scanForSecrets("ghp_1234567890abcdefghij");
    expect(r.clean).toContain("[REDACTED]");
    expect(r.matches).toContain("github-pat-classic");
  });

  it("redacts GitHub fine-grained PATs", () => {
    const token = "github_pat_" + "a".repeat(60);
    const r = scanForSecrets(token);
    expect(r.clean).toContain("[REDACTED]");
    expect(r.matches).toContain("github-pat-fine");
  });

  it("redacts Slack bot tokens", () => {
    const r = scanForSecrets("xoxb-123456-789012345678-abcde");
    expect(r.clean).toContain("[REDACTED]");
    expect(r.matches).toContain("slack-bot-token");
  });

  it("redacts Slack app tokens", () => {
    const r = scanForSecrets("xapp-1-A123456-12345-abcde");
    expect(r.clean).toContain("[REDACTED]");
    expect(r.matches).toContain("slack-app-token");
  });

  it("redacts JWT prefixes", () => {
    const r = scanForSecrets("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0");
    expect(r.clean).toContain("[REDACTED]");
    expect(r.matches).toContain("jwt-prefix");
  });

  it("redacts PEM private keys", () => {
    const r = scanForSecrets("-----BEGIN RSA PRIVATE KEY-----");
    expect(r.clean).toContain("[REDACTED]");
    expect(r.matches).toContain("pem-private-key");
  });

  it("redacts inline passwords", () => {
    const r = scanForSecrets("password=mysecret123");
    expect(r.clean).toContain("[REDACTED]");
    expect(r.matches).toContain("password-inline");
  });

  it("redacts bearer tokens", () => {
    const r = scanForSecrets("Authorization: Bearer abc123def456789012345");
    expect(r.clean).toContain("[REDACTED]");
    expect(r.matches).toContain("bearer-token");
  });

  it("redacts AWS secret keys", () => {
    const r = scanForSecrets("aws_secret_access_key=wJalrXUtnFEMI");
    expect(r.clean).toContain("[REDACTED]");
    expect(r.matches).toContain("aws-secret-key");
  });

  it("redacts URLs with embedded credentials", () => {
    const r = scanForSecrets("https://user:pass@host.com/path");
    expect(r.clean).toContain("[REDACTED]");
    expect(r.matches).toContain("url-with-creds");
  });

  it("leaves clean text untouched", () => {
    const r = scanForSecrets("Hello, how are you today?");
    expect(r.clean).toBe("Hello, how are you today?");
    expect(r.matches).toHaveLength(0);
  });

  it("redacts multiple patterns in one string", () => {
    const r = scanForSecrets("key: sk-1234567890abcdefghij and password=secret");
    expect(r.matches.length).toBeGreaterThanOrEqual(2);
  });
});
