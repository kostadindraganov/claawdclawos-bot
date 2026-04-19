import { logger } from "../../src/logger.js";
import { config } from "../../src/config.js";

/**
 * Generates an avatar layout via the PikaStream API.
 * The endpoint controls the interactive Pika avatar presentation.
 */
export async function generatePikaAvatar(persona: string): Promise<string> {
  logger.info(`pika-skill: Generating Pika avatar for persona: ${persona}`);
  
  if (!config.pikaApiKey && process.env.PIKA_API_KEY === undefined) {
    logger.warn("pika-skill: PIKA_API_KEY not configured. Falling back to mock avatar.");
    return "mock_avatar_url";
  }

  // STUB: Real API integration with PikaStream endpoint.
  // const res = await fetch("https://api.pika.art/v1/avatars", { ... });

  return `https://pika.art/avatar_${persona.toLowerCase()}`;
}
