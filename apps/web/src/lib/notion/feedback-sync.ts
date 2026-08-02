// Best-effort mirror of a feedback submission to the central Notion DB. SDK-free
// — a direct fetch to the Notion REST API. Never throws: any failure (no token,
// integration not connected to the DB, schema mismatch, timeout) is swallowed and
// returns null so it can never break the submission that triggered it. The pure
// schema mapping lives in notion-payload.ts (unit-tested); this half binds env +
// network. Called from `after()` in the submit path, and from the reconciler.

import { env, notionEnabled } from '@/lib/env';
import { buildFeedbackNotionPayload } from '@/lib/notion/notion-payload';
import type { FeedbackPayloadInput } from '@/lib/notion/notion-payload';

const NOTION_API = 'https://api.notion.com/v1/pages';
export const NOTION_VERSION = '2022-06-28';
// Runs out of the request path (via `after()` and the reconciler), so it can
// afford a longer budget than an inline sync.
const TIMEOUT_MS = 8_000;

export type NotionFeedbackInput = FeedbackPayloadInput;

export interface NotionSyncResult {
  pageId: string;
  url: string;
}

// Returns the created Notion page id + url on success, or null when
// disabled/failed. Never throws.
export async function syncFeedbackToNotion(
  input: NotionFeedbackInput,
): Promise<NotionSyncResult | null> {
  if (!notionEnabled) return null;

  const body = buildFeedbackNotionPayload(input, env.NOTION_FEEDBACK_DB_ID);

  try {
    const res = await fetch(NOTION_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.NOTION_API_KEY}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      // 404 = integration not connected to the DB, 401 = bad token, 400 = schema/property mismatch.
      const text = await res.text().catch(() => '');
      console.warn(`[feedback-sync] Notion ${res.status}: ${text.slice(0, 500)}`);
      return null;
    }
    const json = (await res.json()) as { id?: string; url?: string };
    if (!json.id || !json.url) return null;
    return { pageId: json.id, url: json.url };
  } catch (error) {
    console.warn(`[feedback-sync] Notion request failed: ${String(error)}`);
    return null;
  }
}
