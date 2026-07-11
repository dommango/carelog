import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

export interface StorageObject {
  body: Buffer;
  contentType: string;
  sizeBytes: number;
}

export interface Storage {
  getObject(key: string): Promise<StorageObject>;
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  getSignedUrl(key: string, expiresSeconds: number): Promise<{ url: string; method: 'PUT' }>;
}

export type StorageConfig = {
  root: string;
  baseUrl?: string;
};

export class LocalStorage implements Storage {
  private root: string;
  private baseUrl: string;

  constructor(config: StorageConfig) {
    this.root = config.root;
    this.baseUrl = config.baseUrl?.replace(/\/$/, '') ?? '';
  }

  private resolvePath(key: string): string {
    // Reject keys that try to escape the storage root.
    const safeKey = key.replace(/^(\.\.\/)+/g, '').replace(/^\//, '');
    return path.join(this.root, safeKey);
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

  async getSignedUrl(key: string): Promise<{ url: string; method: 'PUT' }> {
    const encoded = encodeURIComponent(key);
    const url = this.baseUrl
      ? `${this.baseUrl}/api/upload?key=${encoded}`
      : `/api/upload?key=${encoded}`;
    return { url, method: 'PUT' };
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
