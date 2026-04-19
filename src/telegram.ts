import { Bot, type Context } from "grammy";
import { type AppState } from "./state.js";
import { classify } from "./message-classifier.js";
import { orchestrate, type OrchestratorResult } from "./orchestrator.js";
import { formatCostFooter } from "./cost-footer.js";
import { logger } from "./logger.js";
import { SecurityError } from "./errors.js";

const TYPING_REFRESH_MS = 4_000;

function isAllowed(state: AppState, chatId: string): boolean {
  if (state.config.telegramAllowlist.size === 0) return true;
  return state.config.telegramAllowlist.has(chatId);
}

async function sendTyping(bot: Bot, chatId: string | number): Promise<void> {
  try {
    await bot.api.sendChatAction(chatId, "typing");
  } catch {
    // Ignore — non-critical
  }
}

function formatResults(
  results: OrchestratorResult[],
  state: AppState,
): string {
  return results
    .map((r) => {
      const footer = formatCostFooter(
        r.result.usage,
        state.config.costFooterMode,
        r.result.durationMs,
        r.result.model,
      );

      const prefix = results.length > 1 ? `**[${r.agentId}]**\n` : "";
      return footer
        ? `${prefix}${r.result.text}\n\n${footer}`
        : `${prefix}${r.result.text}`;
    })
    .join("\n\n---\n\n");
}

export function createTelegramBot(state: AppState): Bot {
  const bot = new Bot(state.config.telegramBotToken);

  bot.command("start", async (ctx: Context) => {
    await ctx.reply(
      "CLAUDECLAW OS online. Send me a message to get started.\n\n" +
        "Available agents: @main, @comms, @content, @ops, @research\n" +
        "Broadcast: @all: <message>\n" +
        "Commands: /schedule, /mission, /consolidate, /status",
    );
  });

  bot.on("message:text", async (ctx: Context) => {
    const chatId = String(ctx.chat?.id);
    const text = ctx.message?.text ?? "";

    if (!isAllowed(state, chatId)) {
      logger.warn("telegram: blocked unlisted chatId", { chatId });
      return;
    }

    const classification = classify(text);

    if (classification.class === "command") {
      await ctx.reply(
        `Command /${classification.command} — use the CLI:\n` +
          `\`npm run ${classification.command} --help\``,
      );
      return;
    }

    state.queue.enqueue(chatId, async () => {
      // Typing indicator loop
      let typingActive = true;
      void sendTyping(bot, ctx.chat!.id);
      const typingInterval = setInterval(() => {
        if (typingActive) void sendTyping(bot, ctx.chat!.id);
      }, TYPING_REFRESH_MS);

      try {
        const before = await state.hooks.runBefore({
          chatId,
          agentId: "main",
          text,
          hasMedia: false,
        });

        if (before === null) return;

        // Route through orchestrator
        const results = await orchestrate({
          db: state.db,
          config: state.config,
          chatId,
          text: before.text,
        });

        // Track usage per agent
        for (const r of results) {
          state.rateTracker.record(chatId, r.agentId, r.result.usage);
        }

        const replyText = formatResults(results, state);

        const afterReply = await state.hooks.runAfter({
          chatId,
          agentId: results[0]?.agentId ?? "main",
          text: replyText,
          inputTokens: results.reduce(
            (sum, r) => sum + r.result.usage.inputTokens,
            0,
          ),
          outputTokens: results.reduce(
            (sum, r) => sum + r.result.usage.outputTokens,
            0,
          ),
          durationMs: Math.max(...results.map((r) => r.result.durationMs)),
        });

        if (afterReply === null) return;

        // Split long messages (Telegram 4096 char limit)
        const maxLen = 4000;
        const fullText = afterReply.text;
        if (fullText.length <= maxLen) {
          await ctx.reply(fullText, { parse_mode: undefined });
        } else {
          const chunks: string[] = [];
          let remaining = fullText;
          while (remaining.length > 0) {
            chunks.push(remaining.slice(0, maxLen));
            remaining = remaining.slice(maxLen);
          }
          for (const chunk of chunks) {
            await ctx.reply(chunk, { parse_mode: undefined });
          }
        }
      } catch (err) {
        if (err instanceof SecurityError) {
          await ctx.reply("Access denied.");
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("telegram: message handler error", { chatId, msg });
        await ctx.reply(`Error: ${msg}`);
      } finally {
        typingActive = false;
        clearInterval(typingInterval);
      }
    });
  });

  bot.catch((err) => {
    logger.error("telegram: unhandled bot error", {
      err: err.message,
    });
  });

  return bot;
}
