import { type CostFooterMode } from "./config.js";
import { type TokenUsage, estimateCostUsd } from "./rate-tracker.js";

export function formatCostFooter(
  usage: TokenUsage,
  mode: CostFooterMode,
  durationMs: number,
  model?: string,
): string {
  if (mode === "off") return "";

  const totalTokens = usage.inputTokens + usage.outputTokens;
  const cost = estimateCostUsd(usage);

  switch (mode) {
    case "compact":
      return `· ${formatTokens(totalTokens)} tok`;

    case "cost":
      return `· $${cost.toFixed(4)}`;

    case "verbose":
      return (
        `· in ${formatTokens(usage.inputTokens)} / ` +
        `out ${formatTokens(usage.outputTokens)} tok` +
        ` · $${cost.toFixed(4)}` +
        ` · ${(durationMs / 1000).toFixed(1)}s`
      );

    case "full":
      return (
        `· in ${formatTokens(usage.inputTokens)} / ` +
        `out ${formatTokens(usage.outputTokens)} tok` +
        (usage.cacheReadTokens > 0
          ? ` · cache ${formatTokens(usage.cacheReadTokens)}`
          : "") +
        ` · $${cost.toFixed(4)}` +
        ` · ${(durationMs / 1000).toFixed(1)}s` +
        (model ? ` · ${model}` : "")
      );
  }
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
