import { env } from '@/lib/env';
import { MAX_SCREENSHOTS } from '@/lib/feedback/limits';

// Public, absolute URLs to the screenshot endpoint for a feedback row. Notion's
// servers fetch these themselves, so a relative path is useless — when
// APP_BASE_URL is unset we return none and the card syncs without images rather
// than carrying URLs Notion cannot resolve.
export function feedbackScreenshotUrls(id: string, count: number): string[] {
  const origin = env.APP_BASE_URL.replace(/\/+$/, '');
  if (!origin) return [];
  const n = Math.min(Math.max(count, 0), MAX_SCREENSHOTS);
  return Array.from({ length: n }, (_, i) => `${origin}/api/feedback/screenshots/${id}/${i}`);
}
