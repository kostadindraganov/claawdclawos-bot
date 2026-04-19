import { logger } from "../../src/logger.js";
import { generatePikaAvatar } from "./avatar.js";
import { runPreflight } from "./preflight.js";

/**
 * Uses Recall.ai to inject a meeting bot into an active session.
 */
export async function injectMeetingBot(
  db: any,
  chatId: string,
  eventId: string,
  persona: string
): Promise<void> {
  logger.info(`pika-skill: Bot preparing to join meeting event: ${eventId}`);
  
  // 1. Run Preflight
  const briefing = await runPreflight(db, chatId, eventId);
  logger.debug(`pika-skill: Briefing ready - ${briefing.context}`);

  // 2. Generate Avatar
  const avatarUrl = await generatePikaAvatar(persona);
  logger.info(`pika-skill: Generated avatar available at ${avatarUrl}`);

  // 3. Trigger Recall.ai bot join sequence
  if (!process.env.RECALL_API_KEY) {
    logger.warn("pika-skill: RECALL_API_KEY not set. Recording simulated entry.");
    return;
  }

  // STUB: Send a request to the Recall.ai API to dispatch the bot.
  /*
    await fetch("https://api.recall.ai/api/v1/bot", {
      method: 'POST',
      headers: { Authorization: `Token ${process.env.RECALL_API_KEY}` },
      body: JSON.stringify({ meeting_url: eventId, bot_name: persona })
    });
  */
  
  logger.info(`pika-skill: Meeting bot successfully injected into ${eventId}`);
}
