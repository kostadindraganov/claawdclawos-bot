export interface ScanResult {
  clean: string;
  matches: string[];
}

const PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "anthropic/openai-key", re: /sk-[A-Za-z0-9]{20,}/g },
  { label: "google-api-key", re: /AIza[0-9A-Za-z_-]{20,}/g },
  { label: "github-pat-classic", re: /ghp_[A-Za-z0-9]{20,}/g },
  { label: "github-pat-fine", re: /github_pat_[A-Za-z0-9_]{60,}/g },
  { label: "slack-bot-token", re: /xoxb-[A-Za-z0-9-]{20,}/g },
  { label: "slack-app-token", re: /xapp-[A-Za-z0-9-]{20,}/g },
  { label: "jwt-prefix", re: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+/g },
  { label: "pem-private-key", re: /-----BEGIN [A-Z ]+PRIVATE KEY-----/g },
  { label: "hex-40", re: /\b[A-Fa-f0-9]{40}\b/g },
  { label: "hex-64", re: /\b[A-Fa-f0-9]{64}\b/g },
  { label: "password-inline", re: /(?:password|passwd|pwd)\s*[:=]\s*\S+/gi },
  { label: "bearer-token", re: /[Bb]earer\s+[A-Za-z0-9._-]{20,}/g },
  { label: "aws-secret-key", re: /aws_secret_access_key\s*[:=]\s*\S+/gi },
  { label: "base64-blob", re: /[A-Za-z0-9+/]{60,}={0,2}/g },
  { label: "url-with-creds", re: /https?:\/\/[^\s@]+@[^\s]+/g },
];

export function scanForSecrets(text: string): ScanResult {
  const matches: string[] = [];
  let clean = text;
  for (const { label, re } of PATTERNS) {
    re.lastIndex = 0;
    if (re.test(text)) {
      re.lastIndex = 0;
      clean = clean.replace(re, "[REDACTED]");
      matches.push(label);
    }
  }
  return { clean, matches };
}
