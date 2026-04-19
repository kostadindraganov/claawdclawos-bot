import { Client, LocalAuth, type Message } from "whatsapp-web.js";
import * as qrcode from "qrcode-terminal";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type AppState } from "./state.js";
import { orchestrate } from "./orchestrator.js";
import { formatCostFooter } from "./cost-footer.js";
import { logger } from "./logger.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

export function createWhatsAppClient(state: AppState): Client {
  const sessionDir =
    state.config.whatsappSessionDir ??
    resolve(PROJECT_ROOT, "store", "whatsapp");

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: sessionDir }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });

  client.on("qr", (qr: string) => {
    logger.info("whatsapp: scan QR code to pair");
    qrcode.generate(qr, { small: true });
  });

  client.on("ready", () => {
    logger.info("whatsapp: client ready");
  });

  client.on("authenticated", () => {
    logger.info("whatsapp: authenticated");
  });

  client.on("auth_failure", (msg: string) => {
    logger.error("whatsapp: auth failure", { msg });
  });

  client.on("disconnected", (reason: string) => {
    logger.warn("whatsapp: disconnected", { reason });
  });

  client.on("message", async (msg: Message) => {
    // Skip group messages, status updates, and own messages
    if (msg.isStatus || msg.fromMe) return;

    const chatId = msg.from;
    const text = msg.body?.trim();
    if (!text) return;

    // Check allowlist (WhatsApp uses phone@c.us format)
    if (
      state.config.telegramAllowlist.size > 0 &&
      !state.config.telegramAllowlist.has(chatId)
    ) {
      logger.warn("whatsapp: blocked unlisted chatId", { chatId });
      return;
    }

    state.queue.enqueue(`wa:${chatId}`, async () => {
      try {
        const before = await state.hooks.runBefore({
          chatId,
          agentId: "main",
          text,
          hasMedia: msg.hasMedia,
        });

        if (before === null) return;

        const results = await orchestrate({
          db: state.db,
          config: state.config,
          chatId,
          text: before.text,
        });

        for (const r of results) {
          state.rateTracker.record(chatId, r.agentId, r.result.usage);
        }

        const replyParts = results.map((r) => {
          const footer = formatCostFooter(
            r.result.usage,
            state.config.costFooterMode,
            r.result.durationMs,
            r.result.model,
          );
          const prefix = results.length > 1 ? `*[${r.agentId}]*\n` : "";
          return footer
            ? `${prefix}${r.result.text}\n\n${footer}`
            : `${prefix}${r.result.text}`;
        });

        let replyText = replyParts.join("\n\n---\n\n");

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
        replyText = afterReply.text;

        // WhatsApp has no hard character limit like Telegram, but chunk at 4000 for readability
        const maxLen = 4000;
        if (replyText.length <= maxLen) {
          await msg.reply(replyText);
        } else {
          let remaining = replyText;
          while (remaining.length > 0) {
            await msg.reply(remaining.slice(0, maxLen));
            remaining = remaining.slice(maxLen);
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error("whatsapp: message handler error", { chatId, err: errMsg });
        try {
          await msg.reply(`Error: ${errMsg}`);
        } catch {
          // Ignore reply failure
        }
      }
    });
  });

  return client;
}

export async function startWhatsApp(state: AppState): Promise<Client> {
  const client = createWhatsAppClient(state);
  await client.initialize();
  return client;
}
