// Pure, env-free mapping of a feedback submission to the Notion `pages.create`
// body for the central "📥 App Feedback" database. Split from the sync module
// (which binds env + network) so the schema mapping stays unit-testable in
// isolation. No I/O, no env, no clock.

// Mirrors the `FeedbackType` Prisma enum (packages/db/prisma/schema.prisma) and
// the wire format the widget POSTs, so no translation is needed at either edge.
export type FeedbackType = 'bug' | 'feedback' | 'request';

// The `App` select value registered on the central DB for this app.
const APP_NAME = 'CareLog';

// app enum → central schema. Emoji drives both the page icon and the Title prefix.
const TYPE_MAP: Record<FeedbackType, { emoji: string; type: string }> = {
  bug: { emoji: '🐛', type: 'Bug' },
  request: { emoji: '✨', type: 'Request' },
  feedback: { emoji: '💬', type: 'Feedback' },
};

const BROWSER_MAX = 200;
const DESCRIPTION_MAX = 2000;

export type NotionEnvironment = 'Production' | 'Development';

export interface FeedbackPayloadInput {
  id: string;
  type: FeedbackType;
  title: string;
  description?: string | null;
  pageUrl?: string | null;
  userEmail?: string | null;
  userAgent?: string | null;
  // Public URLs to the app's screenshot endpoint (Notion fetches these itself).
  screenshotUrls?: string[];
  environment: NotionEnvironment;
}

// Loosely-typed Notion page body — Notion's API surface is broad and untyped
// here on purpose; the tests assert the specific shape we rely on.
export interface NotionPageBody {
  parent: { database_id: string };
  icon: { type: 'emoji'; emoji: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  properties: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  children: any[];
}

// Build the Notion page-create body. `databaseId` is supplied by the caller so
// this stays env-free.
export function buildFeedbackNotionPayload(
  input: FeedbackPayloadInput,
  databaseId: string,
): NotionPageBody {
  const label = TYPE_MAP[input.type];
  const screenshotUrls = input.screenshotUrls ?? [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = {
    Title: { title: [{ text: { content: `${label.emoji} ${input.title}` } }] },
    App: { select: { name: APP_NAME } },
    Type: { select: { name: label.type } },
    Status: { select: { name: 'New' } },
    Environment: { select: { name: input.environment } },
    // App Row ID is the write-once idempotency key the reconciler queries by.
    'App Row ID': { rich_text: [{ text: { content: input.id } }] },
  };

  if (input.pageUrl) properties['Page URL'] = { url: input.pageUrl };
  if (input.userEmail) properties['User Email'] = { email: input.userEmail };
  if (input.userAgent) {
    properties.Browser = {
      rich_text: [{ text: { content: input.userAgent.slice(0, BROWSER_MAX) } }],
    };
  }
  if (screenshotUrls.length) {
    properties.Screenshot = {
      files: screenshotUrls.map((url, i) => ({
        name: `screenshot-${i + 1}`,
        external: { url },
      })),
    };
  }

  const descriptionBlock = input.description
    ? [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              { type: 'text', text: { content: input.description.slice(0, DESCRIPTION_MAX) } },
            ],
          },
        },
      ]
    : [];

  const imageBlocks = screenshotUrls.map((url) => ({
    object: 'block',
    type: 'image',
    image: { type: 'external', external: { url } },
  }));

  return {
    parent: { database_id: databaseId },
    icon: { type: 'emoji', emoji: label.emoji },
    properties,
    children: [...descriptionBlock, ...imageBlocks],
  };
}
