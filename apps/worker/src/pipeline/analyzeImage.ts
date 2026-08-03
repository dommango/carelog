import { prisma } from '@carelog/db';
import { getStorageForWorker } from './storage.js';
import { completeText } from '@carelog/ai';

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
        'You are a helpful vision assistant for a caregiver app. Describe the image briefly and note any readable text (medication labels, notes, food packaging). Return a short plain-text summary.',
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

    await prisma.attachment.update({
      where: { id: attachmentId },
      data: { visionSummary: summary },
    });
    return summary;
  } catch (error) {
    console.error(`[worker] Image analysis failed for ${attachmentId}:`, error);
    return null;
  }
}
