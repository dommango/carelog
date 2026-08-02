import { describe, it, expect, beforeEach, vi } from 'vitest';

// Env and Prisma are mocked so this suite exercises the reconciler's branching
// without a database or a live Notion integration.
vi.mock('@/lib/env', () => ({
  env: {
    NODE_ENV: 'production',
    NOTION_API_KEY: 'secret-token',
    NOTION_FEEDBACK_DB_ID: 'db-id',
    APP_BASE_URL: 'https://carelog.app',
  },
  notionEnabled: true,
}));

const findMany = vi.fn();
const update = vi.fn();
vi.mock('@/lib/prisma', () => ({
  prisma: {
    feedback: {
      findMany: (...args: unknown[]) => findMany(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}));

const syncFeedbackToNotion = vi.fn();
vi.mock('@/lib/notion/feedback-sync', () => ({
  NOTION_VERSION: '2022-06-28',
  syncFeedbackToNotion: (...args: unknown[]) => syncFeedbackToNotion(...args),
}));

const { reconcileFeedbackNotion } = await import('@/lib/notion/feedback-reconcile');

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    type: 'bug',
    title: 'Broken',
    description: null,
    pageUrl: null,
    userEmail: null,
    userAgent: null,
    screenshots: null,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    ...overrides,
  };
}

function notionQueryResponse(results: unknown[]) {
  return {
    ok: true,
    json: async () => ({ results }),
    text: async () => '',
  } as unknown as Response;
}

beforeEach(() => {
  findMany.mockReset();
  update.mockReset();
  syncFeedbackToNotion.mockReset();
  update.mockResolvedValue({});
});

describe('reconcileFeedbackNotion', () => {
  it('only scans unsynced rows under the attempt cap', async () => {
    findMany.mockResolvedValue([]);
    vi.stubGlobal('fetch', vi.fn());

    await reconcileFeedbackNotion();

    const where = findMany.mock.calls[0]![0].where;
    expect(where.notionSyncedAt).toBeNull();
    expect(where.notionSyncAttempts).toEqual({ lt: 5 });
    // Fresh rows are skipped so the submit-path sync gets a grace window.
    expect(where.createdAt.lt).toBeInstanceOf(Date);
  });

  it('backfills an existing Notion page instead of creating a duplicate', async () => {
    findMany.mockResolvedValue([row()]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        notionQueryResponse([{ id: 'page-abc', url: 'https://notion.so/page-abc' }]),
      ),
    );

    const summary = await reconcileFeedbackNotion();

    expect(summary).toEqual({ processed: 1, created: 0, backfilled: 1 });
    // The crash-after-create window must never produce a second page.
    expect(syncFeedbackToNotion).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    const data = update.mock.calls[0]![0].data;
    expect(data.notionPageId).toBe('page-abc');
    expect(data.notionUrl).toBe('https://notion.so/page-abc');
    expect(data.notionSyncedAt).toBeInstanceOf(Date);
  });

  it('queries Notion by App Row ID', async () => {
    findMany.mockResolvedValue([row({ id: 'row-xyz' })]);
    const fetchMock = vi.fn(async () => notionQueryResponse([{ id: 'p', url: 'u' }]));
    vi.stubGlobal('fetch', fetchMock);

    await reconcileFeedbackNotion();

    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('https://api.notion.com/v1/databases/db-id/query');
    expect(JSON.parse(init.body as string).filter).toEqual({
      property: 'App Row ID',
      rich_text: { equals: 'row-xyz' },
    });
  });

  it('creates a page and records the id when none exists yet', async () => {
    findMany.mockResolvedValue([row({ screenshots: ['data:image/jpeg;base64,AAA'] })]);
    vi.stubGlobal('fetch', vi.fn(async () => notionQueryResponse([])));
    syncFeedbackToNotion.mockResolvedValue({ pageId: 'new-page', url: 'https://notion.so/new' });

    const summary = await reconcileFeedbackNotion();

    expect(summary).toEqual({ processed: 1, created: 1, backfilled: 0 });
    const sent = syncFeedbackToNotion.mock.calls[0]![0];
    expect(sent.environment).toBe('Production');
    expect(sent.screenshotUrls).toEqual([
      'https://carelog.app/api/feedback/screenshots/row-1/0',
    ]);
    expect(update.mock.calls[0]![0].data.notionPageId).toBe('new-page');
  });

  it('counts an attempt rather than marking synced when the create fails', async () => {
    findMany.mockResolvedValue([row()]);
    vi.stubGlobal('fetch', vi.fn(async () => notionQueryResponse([])));
    syncFeedbackToNotion.mockResolvedValue(null);

    const summary = await reconcileFeedbackNotion();

    expect(summary).toEqual({ processed: 1, created: 0, backfilled: 0 });
    const data = update.mock.calls[0]![0].data;
    expect(data.notionSyncAttempts).toEqual({ increment: 1 });
    expect(data).not.toHaveProperty('notionSyncedAt');
  });

  it('never creates a page when the dedupe query itself fails', async () => {
    findMany.mockResolvedValue([row()]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 502, text: async () => 'bad gateway' }) as unknown as Response),
    );

    const summary = await reconcileFeedbackNotion();

    // A failed lookup is not evidence that no page exists — retry later instead.
    expect(syncFeedbackToNotion).not.toHaveBeenCalled();
    expect(summary).toEqual({ processed: 1, created: 0, backfilled: 0 });
    expect(update.mock.calls[0]![0].data.notionSyncAttempts).toEqual({ increment: 1 });
  });

  it('keeps processing later rows after one row throws', async () => {
    findMany.mockResolvedValue([row({ id: 'row-1' }), row({ id: 'row-2' })]);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(notionQueryResponse([{ id: 'p2', url: 'u2' }]));
    vi.stubGlobal('fetch', fetchMock);

    const summary = await reconcileFeedbackNotion();

    expect(summary).toEqual({ processed: 2, created: 0, backfilled: 1 });
  });
});
