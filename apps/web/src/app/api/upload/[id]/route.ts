// PUT /api/upload/[id] — receive the bytes for one attachment.
//
// The route is addressed by attachment id and re-derives the storage key from
// the row itself. It deliberately accepts no caller-supplied path: the previous
// `?key=` form let any signed-in user write to an arbitrary location under
// STORAGE_ROOT, for any patient.

import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { getActorForPatient, can } from '@/lib/policy';
import { prisma } from '@/lib/prisma';
import { getStorage } from '@carelog/storage';
import { MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_MIME, normalizeMime } from '@/lib/upload-limits';

/**
 * Read the body, giving up as soon as it exceeds `limit`. Returns null if it
 * does. Deliberately not `await request.arrayBuffer()` followed by a length
 * check: that buffers the whole payload first, so a client that understates
 * Content-Length could still make the server allocate arbitrarily much before
 * the check ever ran.
 *
 * This bounds a single request to roughly 2x `limit` (the retained chunks plus
 * the copy Buffer.concat makes). It does NOT bound memory across concurrent
 * uploads — N authenticated writers still cost N x that. Closing that needs
 * putObject to accept a stream so nothing is buffered at all; deferred with the
 * rest of the storage-backend work.
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

  const { id } = await params;

  const attachment = await prisma.attachment.findUnique({
    where: { id },
    select: {
      storageKey: true,
      kind: true,
      uploadedAt: true,
      event: { select: { patientId: true } },
    },
  });

  if (!attachment) {
    return new Response('Not found', { status: 404 });
  }

  const patientId = attachment.event.patientId;

  // Resolved for THIS patient, not "whichever assignment came first" — a
  // caregiver in two circles must not be judged by the wrong one.
  const actor = await getActorForPatient(session.user.id as string, patientId);

  // Writing an attachment is part of authoring an event, so it takes the same
  // permission. A viewer is read-only and must not be able to replace media
  // merely because it belongs to a patient they can see.
  if (!can(actor, 'event:create', { type: 'event', patientId })) {
    return new Response('Forbidden', { status: 403 });
  }

  // Already stored: report success without rewriting. The bytes are immutable
  // once uploaded, so a confirmed event's photo cannot be swapped out later
  // while its transcript and vision summary still describe the original. 204
  // rather than 409 keeps the offline outbox's at-least-once retries working —
  // a retry after a failed /complete must not wedge the queue.
  if (attachment.uploadedAt) {
    return new Response(null, { status: 204 });
  }

  const contentType = normalizeMime(request.headers.get('content-type'));
  if (!ALLOWED_UPLOAD_MIME[attachment.kind].has(contentType)) {
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

  if (body.byteLength === 0) {
    return new Response('Empty body', { status: 400 });
  }

  await getStorage().putObject(attachment.storageKey, body, contentType);

  // Record what was actually accepted. The row's mimeType was set from the
  // client's claim at create time; this is the value the allowlist vetted, and
  // it is what a future attachment-serving route should trust.
  await prisma.attachment.update({ where: { id }, data: { mimeType: contentType } });

  return new Response(null, { status: 204 });
}
