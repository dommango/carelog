import { prisma } from '@carelog/db';
import { getAttachmentFile, getStorageForWorker } from './storage.js';
import { transcribeAudioFile } from '@carelog/ai';

export async function transcribeAttachment(
  attachmentId: string,
  storageKey: string
): Promise<string | null> {
  const storage = getStorageForWorker();
  const filePath = await getAttachmentFile(storage, storageKey);

  if (!process.env.OPENAI_API_KEY) {
    console.warn(`[worker] OPENAI_API_KEY missing; skipping transcription for ${attachmentId}`);
    return null;
  }

  try {
    const transcript = await transcribeAudioFile(filePath);
    await prisma.attachment.update({
      where: { id: attachmentId },
      data: { transcript },
    });
    return transcript;
  } catch (error) {
    console.error(`[worker] Transcription failed for ${attachmentId}:`, error);
    return null;
  }
}
