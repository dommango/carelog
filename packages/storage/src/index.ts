import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

export interface StorageObject {
  body: Buffer;
  contentType: string;
  sizeBytes: number;
}

/** A storage key resolved outside the storage root, or was otherwise unusable. */
export class InvalidStorageKeyError extends Error {
  constructor(key: string) {
    super(`Invalid storage key: ${key}`);
    this.name = 'InvalidStorageKeyError';
  }
}

export interface Storage {
  getObject(key: string): Promise<StorageObject>;
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  /**
   * URL the client should PUT an attachment's bytes to. Keyed by attachment id,
   * never by storage key: the upload endpoint re-derives the key from the row it
   * owns, so a caller cannot choose where its bytes land.
   *
   * No expiry parameter: this is an authenticated application route, not a
   * pre-signed object URL. A future object-store backend will need its own
   * expiring-credential shape.
   */
  getUploadUrl(attachmentId: string): Promise<{ url: string; method: 'PUT' }>;
}

export type StorageConfig = {
  root: string;
  baseUrl?: string;
};

export class LocalStorage implements Storage {
  private root: string;
  private baseUrl: string;

  constructor(config: StorageConfig) {
    this.root = path.resolve(config.root);
    this.baseUrl = config.baseUrl?.replace(/\/$/, '') ?? '';
  }

  private resolvePath(key: string): string {
    // path.resolve collapses `..` segments and lets an absolute key win
    // outright, so the containment check has to happen on the *resolved* path.
    // Sanitising the raw string instead is what let `a/../../../etc/passwd`
    // through: stripping a leading `../` run leaves the interior ones intact.
    const resolved = path.resolve(this.root, key);
    // Requiring the separator also rejects the root itself and sibling
    // directories that merely share its prefix (`/data/storage-evil`).
    if (!resolved.startsWith(this.root + path.sep)) {
      throw new InvalidStorageKeyError(key);
    }
    return resolved;
  }

  async getObject(key: string): Promise<StorageObject> {
    const filePath = this.resolvePath(key);
    const body = await readFile(filePath);
    return {
      body,
      contentType: inferContentType(key),
      sizeBytes: body.length,
    };
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    const filePath = this.resolvePath(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, body);
  }

  async getUploadUrl(attachmentId: string): Promise<{ url: string; method: 'PUT' }> {
    const route = `/api/upload/${encodeURIComponent(attachmentId)}`;
    return { url: this.baseUrl ? `${this.baseUrl}${route}` : route, method: 'PUT' };
  }
}

function inferContentType(key: string): string {
  const ext = path.extname(key).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.webm':
      return 'audio/webm';
    case '.mp3':
      return 'audio/mpeg';
    case '.mp4':
      return 'video/mp4';
    default:
      return 'application/octet-stream';
  }
}

let shared: Storage | null = null;

export function getStorage(): Storage {
  if (!shared) {
    const root = process.env.STORAGE_ROOT ?? path.join(process.cwd(), 'storage');
    const baseUrl = process.env.STORAGE_BASE_URL;
    shared = new LocalStorage({ root, baseUrl });
  }
  return shared;
}

export function setStorage(storage: Storage): void {
  shared = storage;
}
