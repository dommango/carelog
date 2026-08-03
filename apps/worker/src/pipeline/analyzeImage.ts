import { prisma } from '@carelog/db';
import { getStorageForWorker } from './storage.js';
import { capVisionSummary, completeText } from '@carelog/ai';

export async function analyzeImage(
  attachmentId: string,
  storageKey: string
): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(`[worker] ANTHROPIC_API_KEY missing; skipping image analysis for ${attachmentId}`);
    return null;
  }

  // Inside the try: the storage read used to sit above it, so a missing or
  // unreadable file threw straight out of the whole pipeline run rather than
  // degrading to "no vision summary".
  try {
    const storage = getStorageForWorker();
    const obj = await storage.getObject(storageKey);

    const base64 = obj.body.toString('base64');
    const mime = obj.contentType ?? 'image/jpeg';

    const summary = await completeText({
      system:
        'You are a vision assistant for a caregiver app. Describe only what is visibly in the photo and any readable text (medication labels, notes, food packaging). ' +
        'Do not diagnose, assess how the person is doing, comment on their condition, or suggest care. ' +
        'Do not guess at anything you cannot clearly see. ' +
        'Answer in one or two short sentences, under 200 characters, as plain text.',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mime,
                data: base64,
              },
            },
            {
              type: 'text',
              text: 'Describe this photo and extract any readable text.',
            },
          ],
        },
      ],
    });

    // The prompt asks for brevity; this enforces it. The description renders
    // inline under the caregiver's own words on the timeline.
    const capped = capVisionSummary(summary);

    await prisma.attachment.update({
      where: { id: attachmentId },
      data: { visionSummary: capped },
    });
    return capped;
  } catch (error) {
    console.error(`[worker] Image analysis failed for ${attachmentId}:`, error);
    return null;
  }
}
