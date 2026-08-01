import { test, expect, type Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@carelog.local';
const ADMIN_NAME = 'Admin User';

// 1x1 transparent PNG — the smallest payload that satisfies the route's data-URL
// shape check and still decodes to real bytes at the screenshot endpoint.
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function signIn(page: Page) {
  const res = await page.request.post('/api/auth/test-login', {
    data: { email: ADMIN_EMAIL, name: ADMIN_NAME },
  });
  expect(res.ok()).toBe(true);
  await page.goto('/');
}

// The Notion mirror is env-gated (NOTION_API_KEY + NOTION_FEEDBACK_DB_ID) and no-ops
// in test, so these specs assert the source of truth — the DB row, reached through
// the screenshot endpoint — rather than a live Notion page. The page body sent to
// Notion is asserted separately in src/lib/notion/notion-payload.test.ts.

test('submits feedback through the widget and closes on success', async ({ page }) => {
  await signIn(page);

  await page.getByRole('button', { name: 'Send feedback' }).click();
  await expect(page.getByRole('heading', { name: 'Send feedback' })).toBeVisible();

  await page.getByRole('button', { name: 'Problem' }).click();
  await page.getByPlaceholder('What went wrong?').fill('Nebuliser entry did not save');
  await page
    .getByPlaceholder(/What were you doing/)
    .fill('Tapped save on the 8am treatment and the timeline stayed empty.');

  const submission = page.waitForResponse(
    (res) => res.url().endsWith('/api/feedback') && res.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Send', exact: true }).click();

  const response = await submission;
  expect(response.status()).toBe(201);
  expect((await response.json()).id).toBeTruthy();

  // Panel closes and the launcher comes back.
  await expect(page.getByRole('heading', { name: 'Send feedback' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Send feedback' })).toBeVisible();
});

test('serves a stored screenshot as sandboxed raster bytes', async ({ page }) => {
  await signIn(page);

  const created = await page.request.post('/api/feedback', {
    data: {
      type: 'bug',
      title: 'Screenshot endpoint check',
      pageUrl: 'http://localhost:3000/',
      screenshots: [PNG_DATA_URL],
    },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();

  const image = await page.request.get(`/api/feedback/screenshots/${id}/0`);
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toBe('image/png');
  expect(image.headers()['x-content-type-options']).toBe('nosniff');
  expect(image.headers()['content-security-policy']).toBe("default-src 'none'; sandbox");
  expect((await image.body()).length).toBeGreaterThan(0);

  // Out-of-range index and unknown row must not leak anything.
  expect((await page.request.get(`/api/feedback/screenshots/${id}/1`)).status()).toBe(404);
  expect((await page.request.get(`/api/feedback/screenshots/${id}/9`)).status()).toBe(404);
  expect(
    (await page.request.get('/api/feedback/screenshots/00000000-0000-4000-8000-000000000000/0'))
      .status(),
  ).toBe(404);
});

test('rejects malformed submissions', async ({ page }) => {
  await signIn(page);

  // Empty title.
  const noTitle = await page.request.post('/api/feedback', {
    data: { type: 'bug', title: '   ' },
  });
  expect(noTitle.status()).toBe(400);

  // SVG can carry script, so it must never be accepted as a screenshot.
  const svg = await page.request.post('/api/feedback', {
    data: {
      type: 'bug',
      title: 'SVG attempt',
      screenshots: ['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='],
    },
  });
  expect(svg.status()).toBe(400);

  // Non-http(s) page URLs must not be storable.
  const badUrl = await page.request.post('/api/feedback', {
    data: { type: 'bug', title: 'Bad url', pageUrl: 'javascript:alert(1)' },
  });
  expect(badUrl.status()).toBe(400);
});
