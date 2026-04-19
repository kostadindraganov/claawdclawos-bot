import { logger } from "../../src/logger.js";
import { analyzeImageWithGemini } from "../../src/media.js";

/**
 * Periodically captures frames from the meeting video stream to run layout, sentiment, 
 * or whiteboard logic via Gemini Vision.
 */
export async function analyzeMeetingScreen(frameBuffer: Buffer): Promise<string | null> {
  try {
    logger.debug("pika-skill: Analyzing screen frame...");
    
    // Simulate converting raw meeting frame buffer into a Data URI (or upload it).
    const frameDataUri = `data:image/jpeg;base64,${frameBuffer.toString("base64")}`;

    // Delegate analysis to the media module.
    const analysis = await analyzeImageWithGemini(
      frameDataUri, 
      "Analyze this meeting frame. Summarize any visible whiteboard context, slide bullet points, or participant reactions."
    );
    
    return analysis;
  } catch (err) {
    logger.error("pika-skill: Failed to analyze meeting screen frame", { err });
    return null;
  }
}
