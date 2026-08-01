import { NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { rateLimit, clientIpFromForwardedFor } from '@/lib/rate-limit';
import { createFeedback } from '@/lib/services/feedback';
import { MAX_SCREENSHOTS } from '@/lib/feedback/limits';

export const dynamic = 'force-dynamic';

// Each screenshot is a base64 data URL (region snip, JPEG ~0.6). Constrain subtype
// + base64 shape (no SVG, no trailing content) and cap per-item + combined size.
const dataUrl = z
  .string()
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)
  .max(1_500_000);

const MAX_SCREENSHOTS_BYTES = 3_000_000;

const schema = z.object({
  type: z.enum(['bug', 'feedback', 'request']),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000).optional(),
  // Restrict to http(s) so a stored value can never be a javascript:/data: URL.
  pageUrl: z
    .string()
    .max(2048)
    .regex(/^https?:\/\//i, 'must be an http(s) URL')
    .optional(),
  userAgent: z.string().max(1024).optional(),
  screenshots: z
    .array(dataUrl)
    .max(MAX_SCREENSHOTS)
    .refine(
      (items) => items.reduce((total, item) => total + item.length, 0) <= MAX_SCREENSHOTS_BYTES,
      'screenshots exceed the combined size limit',
    )
    .optional(),
});

// Open to anyone — the floating widget renders app-wide, including on /login. A
// signed-in user is attributed; anonymous submissions are still kept.
export async function POST(request: NextRequest) {
  const session = await auth();
  const user = session?.user;

  // IP-less clients all collapse onto one "anon" key, so give that shared bucket a
  // larger budget rather than starving every anonymous submitter through one small one.
  const ip = clientIpFromForwardedFor(request.headers.get('x-forwarded-for'));
  const { key, limit } = user?.id
    ? { key: `feedback:${user.id as string}`, limit: 10 }
    : ip === 'anon'
      ? { key: 'feedback:anon-global', limit: 30 }
      : { key: `feedback:ip:${ip}`, limit: 10 };
  if (!rateLimit(key, limit, 5 * 60_000).ok) {
    return new Response('Too many requests', { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await createFeedback({
    ...parsed.data,
    userId: (user?.id as string | undefined) ?? null,
    userEmail: user?.email ?? null,
  });
  return Response.json({ id }, { status: 201 });
}
