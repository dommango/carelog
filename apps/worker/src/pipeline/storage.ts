import path from 'path';
import os from 'os';
import { writeFile, mkdir } from 'fs/promises';
import { getStorage, Storage } from '@carelog/storage';

export async function getAttachmentFile(
  storage: Storage,
  storageKey: string
): Promise<string> {
  const obj = await storage.getObject(storageKey);
  const tmpDir = path.join(os.tmpdir(), 'carelog-worker');
  await mkdir(tmpDir, { recursive: true });
  const filePath = path.join(tmpDir, path.basename(storageKey));
  await writeFile(filePath, obj.body);
  return filePath;
}

export function getStorageForWorker(): Storage {
  return getStorage();
}
