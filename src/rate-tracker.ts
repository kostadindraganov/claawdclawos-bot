export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface AgentUsageSummary {
  chatId: string;
  agentId: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  requestCount: number;
  lastRequestAt: number;
}

const INPUT_COST_PER_1K = 0.003;
const OUTPUT_COST_PER_1K = 0.015;

export function estimateCostUsd(usage: TokenUsage): number {
  return (
    (usage.inputTokens / 1000) * INPUT_COST_PER_1K +
    (usage.outputTokens / 1000) * OUTPUT_COST_PER_1K
  );
}

export class RateTracker {
  private readonly buckets = new Map<string, AgentUsageSummary>();

  private key(chatId: string, agentId: string): string {
    return `${chatId}::${agentId}`;
  }

  record(chatId: string, agentId: string, usage: TokenUsage): void {
    const k = this.key(chatId, agentId);
    const existing = this.buckets.get(k);
    if (existing) {
      existing.totalInputTokens += usage.inputTokens;
      existing.totalOutputTokens += usage.outputTokens;
      existing.totalCacheReadTokens += usage.cacheReadTokens;
      existing.totalCacheWriteTokens += usage.cacheWriteTokens;
      existing.requestCount += 1;
      existing.lastRequestAt = Date.now();
    } else {
      this.buckets.set(k, {
        chatId,
        agentId,
        totalInputTokens: usage.inputTokens,
        totalOutputTokens: usage.outputTokens,
        totalCacheReadTokens: usage.cacheReadTokens,
        totalCacheWriteTokens: usage.cacheWriteTokens,
        requestCount: 1,
        lastRequestAt: Date.now(),
      });
    }
  }

  get(chatId: string, agentId: string): AgentUsageSummary | undefined {
    return this.buckets.get(this.key(chatId, agentId));
  }

  all(): AgentUsageSummary[] {
    return [...this.buckets.values()];
  }
}
