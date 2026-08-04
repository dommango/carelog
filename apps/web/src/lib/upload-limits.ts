// Shared between the capture UI and the upload route so the two can never
// disagree. A file the picker accepts but the server rejects is not a blocked
// attack — it is a care note that vanishes, because a rejected upload only
// retries in the background and then gives up quietly.

/** Roughly a high-resolution phone photo or several minutes of voice memo. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * What the capture UI can actually hand us, per attachment kind.
 *
 * Deliberately wider than what the AI pipeline can read: iOS commonly returns
 * image/heic and Safari records audio/mp4. Storing those is the whole point —
 * the raw capture is the record of care, and an enrichment step that cannot
 * read it should degrade on its own rather than cost the user the file.
 *
 * No image/svg+xml: SVG is an image type that can carry script.
 */
export const ALLOWED_UPLOAD_MIME: Record<'photo' | 'audio', ReadonlySet<string>> = {
  photo: new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/avif',
    'image/heic',
    'image/heif',
  ]),
  audio: new Set([
    'audio/webm',
    'audio/mpeg',
    'audio/mp4',
    'audio/ogg',
    'audio/wav',
    'audio/x-wav',
    'audio/aac',
    'audio/x-m4a',
  ]),
};

/** Normalise a Content-Type / File.type: drop parameters, lowercase. */
export function normalizeMime(value: string | null | undefined): string {
  return (value ?? '').split(';')[0]!.trim().toLowerCase();
}

export function isAllowedUpload(kind: 'photo' | 'audio', mimeType: string | null | undefined): boolean {
  return ALLOWED_UPLOAD_MIME[kind].has(normalizeMime(mimeType));
}
