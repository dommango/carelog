// PUT /api/upload/[id] — receive the bytes for one attachment.
//
// The route is addressed by attachment id and re-derives the storage key from
// the row itself. It deliberately accepts no caller-supplied path: the previous
// `?key=` form let any signed-in user write to an arbitrary location under
// STORAGE_ROOT, for any patient.

import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { getActor } from '@/lib/policy';
import { prisma } from '@/lib/prisma';
import { getStorage } from '@carelog/storage';

// Roughly a high-resolution phone photo or a few minutes of voice memo. Kept in
// step with the client-side cap in the create-event flow.
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// Only what the capture UI can actually produce, and only formats the AI
// pipeline reads. No SVG: it is an image type that can carry script.
const ALLOWED_MIME: Record<'photo' | 'audio', ReadonlySet<string>> = {
  photo: new Set(['image/png', 'image/jpeg', 'image/webp']),
  audio: new Set(['audio/webm', 'audio/mpeg', 'audio/mp4', 'audio/ogg']),
};

/**
 * Read the body, giving up as soon as it exceeds `limit`. Returns null if it
 * does. Deliberately not `await request.arrayBuffer()` followed by a length
 * check: that buffers the whole payload first, so a client that understates
 * Content-Length could still make the server allocate arbitrarily much before
 * the check ever ran. Peak memory here is bounded by limit plus one chunk.
 */
async function readCappedBody(request: NextRequest, limit: number): Promise<Buffer | null> {
  if (!request.body) return Buffer.alloc(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const actor = await getActor(session.user.id as string);
  if (!actor) {
    return new Response('Forbidden', { status: 403 });
  }

  const { id } = await params;

  const attachment = await prisma.attachment.findUnique({
    where: { id },
    select: {
      storageKey: true,
      kind: true,
      event: { select: { patientId: true } },
    },
  });

  if (!attachment) {
    return new Response('Not found', { status: 404 });
  }

  if (attachment.event.patientId !== actor.assignment.patientId) {
    return new Response('Forbidden', { status: 403 });
  }

  const contentType = (request.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!ALLOWED_MIME[attachment.kind].has(contentType)) {
    return new Response('Unsupported media type', { status: 415 });
  }

  // Cheap rejection first, so an honest oversized upload costs nothing to
  // refuse. Content-Length is client-controlled, so the read below enforces the
  // real limit regardless of what was declared here.
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) {
    return new Response('Payload too large', { status: 413 });
  }

  const body = await readCappedBody(request, MAX_UPLOAD_BYTES);
  if (body === null) {
    return new Response('Payload too large', { status: 413 });
  }

  await getStorage().putObject(attachment.storageKey, body, contentType);

  return new Response(null, { status: 204 });
}
