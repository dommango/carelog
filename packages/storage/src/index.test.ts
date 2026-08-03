import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { LocalStorage, InvalidStorageKeyError } from './index.js';

let root: string;
let outside: string;
let storage: LocalStorage;

beforeEach(async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'carelog-storage-'));
  root = path.join(base, 'storage');
  outside = path.join(base, 'outside');
  await mkdir(root, { recursive: true });
  await mkdir(outside, { recursive: true });
  storage = new LocalStorage({ root });
});

afterEach(async () => {
  await rm(path.dirname(root), { recursive: true, force: true });
});

describe('LocalStorage path containment', () => {
  // Each of these resolves outside the root. The previous implementation only
  // stripped a *leading* `../` run and a leading `/`, so every case below except
  // the first walked straight out of the storage directory.
  const escapes: Array<[string, string]> = [
    ['leading ../ run', '../../etc/passwd'],
    ['interior .. segments', 'attachments/../../../etc/passwd'],
    ['.. after a leading strip', '../a/../../etc/passwd'],
    ['absolute key', '/etc/passwd'],
    ['bare parent', '..'],
    ['prefix-sharing sibling', '../storage-evil/x'],
  ];

  for (const [name, key] of escapes) {
    it(`rejects ${name}: ${key}`, async () => {
      await expect(storage.putObject(key, Buffer.from('x'), 'text/plain')).rejects.toThrow(
        InvalidStorageKeyError
      );
      await expect(storage.getObject(key)).rejects.toThrow(InvalidStorageKeyError);
    });
  }

  it('rejects the root itself', async () => {
    await expect(storage.putObject('', Buffer.from('x'), 'text/plain')).rejects.toThrow(
      InvalidStorageKeyError
    );
  });

  it('does not write outside the root when a traversal is attempted', async () => {
    const target = path.join(outside, 'pwned.txt');
    const key = path.relative(root, target); // ../outside/pwned.txt

    await expect(storage.putObject(key, Buffer.from('pwned'), 'text/plain')).rejects.toThrow(
      InvalidStorageKeyError
    );
    await expect(readFile(target)).rejects.toThrow();
  });

  it('accepts a legitimate nested key and round-trips it', async () => {
    const key = 'attachments/event-1/attachment-1.png';
    await storage.putObject(key, Buffer.from('bytes'), 'image/png');

    const stored = await storage.getObject(key);
    expect(stored.body.toString()).toBe('bytes');
    expect(stored.contentType).toBe('image/png');
    expect(stored.sizeBytes).toBe(5);

    // ...and it really landed under the root.
    const onDisk = await readFile(path.join(root, key));
    expect(onDisk.toString()).toBe('bytes');
  });

  it('accepts a key that normalises back inside the root', async () => {
    await writeFile(path.join(root, 'inside.txt'), 'ok');
    const stored = await storage.getObject('attachments/../inside.txt');
    expect(stored.body.toString()).toBe('ok');
  });
});

describe('getUploadUrl', () => {
  it('addresses the attachment by id, never by storage key', async () => {
    const { url, method } = await storage.getUploadUrl('att-123');
    expect(url).toBe('/api/upload/att-123');
    expect(method).toBe('PUT');
  });

  it('encodes the id and prefixes the configured base URL', async () => {
    const based = new LocalStorage({ root, baseUrl: 'https://carelog.example.com/' });
    const { url } = await based.getUploadUrl('a/b');
    expect(url).toBe('https://carelog.example.com/api/upload/a%2Fb');
  });
});
