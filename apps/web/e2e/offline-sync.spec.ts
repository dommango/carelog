import { test, expect, type Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@carelog.local';
const ADMIN_NAME = 'Admin User';

async function signIn(page: Page) {
  const res = await page.request.post('/api/auth/test-login', {
    data: { email: ADMIN_EMAIL, name: ADMIN_NAME },
  });
  expect(res.ok()).toBe(true);
  await page.goto('/');
}

test('airplane-mode capture syncs exactly one non-duplicated event', async ({ page, context }) => {
  await signIn(page);

  // Wait for initial sync to populate local data.
  await page.waitForSelector('text=No events yet.', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(500);

  // Go offline before capture.
  await context.setOffline(true);

  // Create an event while offline using the same localDb/outbox code the UI uses.
  const offlineEventId = await page.evaluate(async () => {
    const test = window.__CARELOG_TEST__;
    if (!test) throw new Error('Test helpers not exposed');

    const eventId = crypto.randomUUID();
    const idempotencyKey = crypto.randomUUID();
    const clientId = test.getClientId();
    const now = new Date().toISOString();

    const payload = {
      id: eventId,
      rawInput: 'Offline test breakfast',
      category: 'meal',
      occurredAt: now,
      clientId,
      idempotencyKey,
      attachments: [],
    };

    const localEvent = test.eventToLocal({
      ...payload,
      patientId: '',
      authorId: '',
      status: 'pending_ai',
      capturedAt: now,
      hasConflict: false,
      version: 1,
      updatedAt: now,
      createdAt: now,
      deletedAt: null,
      attachments: [],
    }, false);

    await test.localDb.events.put(localEvent);
    await test.queueOutbox({
      id: eventId,
      type: 'event:create',
      payload,
      idempotencyKey,
      clientId,
    });

    return eventId;
  });

  expect(offlineEventId).toBeTruthy();

  // Verify the event is in local IndexedDB while still offline.
  const offlineEvent = await page.evaluate(async (id: string) => {
    const test = window.__CARELOG_TEST__;
    if (!test) throw new Error('Test helpers not exposed');
    return await test.localDb.events.get(id);
  }, offlineEventId);
  expect(offlineEvent).toBeTruthy();
  expect(offlineEvent!.rawInput).toBe('Offline test breakfast');

  // Go online and wait for the outbox to drain.
  await context.setOffline(false);
  await page.waitForTimeout(3000);

  // Trigger a delta sync from the page and verify the event persisted server-side.
  const syncedEvent = await page.evaluate(async () => {
    const test = window.__CARELOG_TEST__;
    if (!test) throw new Error('Test helpers not exposed');
    const cursor = await test.getSyncCursor();
    const data = await test.pullDelta(cursor);
    return data.events.find((e) => e.rawInput === 'Offline test breakfast');
  });
  expect(syncedEvent).toBeTruthy();
  expect(syncedEvent!.id).toBe(offlineEventId);

  // Open a fresh browser context and verify the event appears exactly once.
  const newContext = await context.browser()!.newContext();
  const newPage = await newContext.newPage();
  await signIn(newPage);
  await expect(newPage.getByText('Offline test breakfast')).toBeVisible();
  const serverCount = await newPage.locator('[data-testid="event-card"]').count();
  expect(serverCount).toBe(1);
  await newContext.close();
});
