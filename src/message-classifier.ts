export type MessageClass = "simple" | "complex" | "command";

export interface ClassificationResult {
  class: MessageClass;
  targetAgent?: string; // set when class === 'complex' and message starts with @agentId:
  command?: string;     // set when class === 'command', e.g. '/schedule'
}

const AGENT_ROUTE_RE = /^@([a-z][a-z0-9_-]{0,29}):\s*/;
const COMMAND_RE = /^\/([a-z][a-z0-9_-]*)(\s|$)/;
const CODE_FENCE_RE = /```/;

export function classify(text: string): ClassificationResult {
  // Command routes bypass the agent entirely
  const cmdMatch = COMMAND_RE.exec(text);
  if (cmdMatch) {
    return { class: "command", command: cmdMatch[1] };
  }

  // Explicit agent routing
  const agentMatch = AGENT_ROUTE_RE.exec(text);
  if (agentMatch) {
    return { class: "complex", targetAgent: agentMatch[1] };
  }

  // Code fences imply complex
  if (CODE_FENCE_RE.test(text)) return { class: "complex" };

  // Short messages without a question mark → simple
  if (text.length <= 80 && !text.includes("?")) return { class: "simple" };

  return { class: "complex" };
}
