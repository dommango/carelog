import { describe, it, expect } from 'vitest';
import { buildFeedbackNotionPayload } from '@/lib/notion/notion-payload';
import type { FeedbackPayloadInput } from '@/lib/notion/notion-payload';

const DB_ID = '00000000-0000-0000-0000-00000000feed';

function input(overrides: Partial<FeedbackPayloadInput> = {}): FeedbackPayloadInput {
  return {
    id: 'a1b2c3d4-0000-4000-8000-000000000001',
    type: 'bug',
    title: 'Nebuliser log will not save',
    environment: 'Production',
    ...overrides,
  };
}

describe('buildFeedbackNotionPayload', () => {
  it('maps each app type to the central Type value, emoji icon and title prefix', () => {
    const cases = [
      { type: 'bug' as const, emoji: '🐛', notionType: 'Bug' },
      { type: 'request' as const, emoji: '✨', notionType: 'Request' },
      { type: 'feedback' as const, emoji: '💬', notionType: 'Feedback' },
    ];

    for (const { type, emoji, notionType } of cases) {
      const body = buildFeedbackNotionPayload(input({ type, title: 'Something' }), DB_ID);
      expect(body.icon).toEqual({ type: 'emoji', emoji });
      expect(body.properties.Type).toEqual({ select: { name: notionType } });
      expect(body.properties.Title.title[0].text.content).toBe(`${emoji} Something`);
    }
  });

  it('always stamps the CareLog App value, a New status and the target database', () => {
    const body = buildFeedbackNotionPayload(input(), DB_ID);
    expect(body.parent).toEqual({ database_id: DB_ID });
    expect(body.properties.App).toEqual({ select: { name: 'CareLog' } });
    expect(body.properties.Status).toEqual({ select: { name: 'New' } });
    expect(body.properties.Environment).toEqual({ select: { name: 'Production' } });
  });

  it('writes the row id to App Row ID so the reconciler can dedupe on it', () => {
    const body = buildFeedbackNotionPayload(input({ id: 'row-42' }), DB_ID);
    expect(body.properties['App Row ID'].rich_text[0].text.content).toBe('row-42');
  });

  it('omits optional properties that carry no value', () => {
    const body = buildFeedbackNotionPayload(input(), DB_ID);
    expect(body.properties).not.toHaveProperty('Page URL');
    expect(body.properties).not.toHaveProperty('User Email');
    expect(body.properties).not.toHaveProperty('Browser');
    expect(body.properties).not.toHaveProperty('Screenshot');
    expect(body.children).toEqual([]);
  });

  it('includes optional properties when present', () => {
    const body = buildFeedbackNotionPayload(
      input({
        pageUrl: 'https://carelog.app/timeline',
        userEmail: 'carer@example.com',
        userAgent: 'Mozilla/5.0',
      }),
      DB_ID,
    );
    expect(body.properties['Page URL']).toEqual({ url: 'https://carelog.app/timeline' });
    expect(body.properties['User Email']).toEqual({ email: 'carer@example.com' });
    expect(body.properties.Browser.rich_text[0].text.content).toBe('Mozilla/5.0');
  });

  it('truncates a long browser string to 200 characters', () => {
    const body = buildFeedbackNotionPayload(input({ userAgent: 'u'.repeat(500) }), DB_ID);
    expect(body.properties.Browser.rich_text[0].text.content).toHaveLength(200);
  });

  it('truncates a long description to 2000 characters', () => {
    const body = buildFeedbackNotionPayload(input({ description: 'd'.repeat(5000) }), DB_ID);
    expect(body.children[0].paragraph.rich_text[0].text.content).toHaveLength(2000);
  });

  it('adds screenshots as external files and as inline image blocks', () => {
    const urls = ['https://carelog.app/api/feedback/screenshots/row-1/0', 'https://carelog.app/api/feedback/screenshots/row-1/1'];
    const body = buildFeedbackNotionPayload(
      input({ description: 'It broke', screenshotUrls: urls }),
      DB_ID,
    );

    expect(body.properties.Screenshot.files).toEqual([
      { name: 'screenshot-1', external: { url: urls[0] } },
      { name: 'screenshot-2', external: { url: urls[1] } },
    ]);
    // Description paragraph first, then one image block per screenshot.
    expect(body.children).toHaveLength(3);
    expect(body.children[0].type).toBe('paragraph');
    expect(body.children[1]).toEqual({
      object: 'block',
      type: 'image',
      image: { type: 'external', external: { url: urls[0] } },
    });
    expect(body.children[2].image.external.url).toBe(urls[1]);
  });
});
