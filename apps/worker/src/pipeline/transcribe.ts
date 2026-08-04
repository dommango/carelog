import { unlink } from 'fs/promises';
import { prisma } from '@carelog/db';
import { getAttachmentFile, getStorageForWorker } from './storage.js';
import { transcribeAudioFile } from '@carelog/ai';

export async function transcribeAttachment(
  attachmentId: string,
  storageKey: string
): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) {
    console.warn(`[worker] OPENAI_API_KEY missing; skipping transcription for ${attachmentId}`);
    return null;
  }

  // Inside the try: the storage read used to sit above it, so a missing or
  // unreadable file threw straight out of the whole pipeline run rather than
  // degrading to "no transcript".
  let filePath: string | null = null;
  try {
    const storage = getStorageForWorker();
    filePath = await getAttachmentFile(storage, storageKey);

    const transcript = await transcribeAudioFile(filePath);
    await prisma.attachment.update({
      where: { id: attachmentId },
      data: { transcript },
    });
    return transcript;
  } catch (error) {
    console.error(`[worker] Transcription failed for ${attachmentId}:`, error);
    return null;
  } finally {
    // The copy under /tmp is scratch space for Whisper. Left behind it
    // accumulates for the life of the container — and it is PHI sitting on
    // disk outside the storage root.
    if (filePath) {
      await unlink(filePath).catch((error) => {
        console.error(`[worker] Failed to remove temp audio ${filePath}:`, error);
      });
    }
  }
}
