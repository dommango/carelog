import { after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { syncFeedbackToNotion } from '@/lib/notion/feedback-sync';
import { feedbackScreenshotUrls } from '@/lib/feedback/screenshot-urls';
import type { FeedbackType } from '@/lib/notion/notion-payload';

export interface CreateFeedbackInput {
  type: FeedbackType;
  title: string;
  description?: string;
  pageUrl?: string;
  userAgent?: string;
  screenshots?: string[];
  userId: string | null;
  userEmail: string | null;
}

// Postgres is the source of truth: the row is committed before the response is
// sent, and the Notion mirror runs via `after()` so a slow or broken integration
// can never delay or fail a submission. A row whose mirror never lands keeps
// notionSyncedAt NULL and is picked up by the reconciler.
export async function createFeedback(input: CreateFeedbackInput): Promise<{ id: string }> {
  const screenshots = input.screenshots ?? [];

  const row = await prisma.feedback.create({
    data: {
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      pageUrl: input.pageUrl ?? null,
      userAgent: input.userAgent ?? null,
      userId: input.userId,
      userEmail: input.userEmail,
      screenshots: screenshots.length > 0 ? screenshots : undefined,
    },
    select: { id: true },
  });

  after(async () => {
    const result = await syncFeedbackToNotion({
      id: row.id,
      type: input.type,
      title: input.title,
      description: input.description,
      pageUrl: input.pageUrl,
      userEmail: input.userEmail,
      userAgent: input.userAgent,
      screenshotUrls: feedbackScreenshotUrls(row.id, screenshots.length),
      environment: env.NODE_ENV === 'production' ? 'Production' : 'Development',
    });
    if (!result) return;
    // Writeback can still be lost if the process dies here; the reconciler's
    // query-by-App-Row-ID backfill covers that window without duplicating.
    await prisma.feedback
      .update({
        where: { id: row.id },
        data: {
          notionPageId: result.pageId,
          notionUrl: result.url,
          notionSyncedAt: new Date(),
        },
      })
      .catch((error: unknown) => {
        console.warn(`[feedback] Notion writeback failed for ${row.id}: ${String(error)}`);
      });
  });

  return { id: row.id };
}
