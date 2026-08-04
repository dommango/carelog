import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@carelog.local';
const ADMIN_NAME = 'Admin User';

// WCAG 2.0/2.1/2.2 at levels A and AA — the conformance bar this app targets.
// Deliberately excludes axe's `best-practice` tag: those rules are opinions, not
// conformance failures, and a lint-style gate that fails on opinions gets muted.
const WCAG_A_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// No rules are disabled. If a genuinely noisy rule ever needs suppressing, add it
// here with a comment naming the reason and the issue tracking the real fix — an
// empty list is the goal state, not an oversight.
const DISABLED_RULES: string[] = [];

async function signIn(page: Page) {
  const res = await page.request.post('/api/auth/test-login', {
    // Ignored by the dev server these specs normally run against; required when
    // pointed at a non-development deployment via PLAYWRIGHT_BASE_URL.
    headers: { 'x-test-login-secret': process.env.TEST_LOGIN_SECRET ?? '' },
    data: { email: ADMIN_EMAIL, name: ADMIN_NAME },
  });
  expect(res.ok()).toBe(true);
}

function scan(page: Page) {
  return new AxeBuilder({ page }).withTags(WCAG_A_AA).disableRules(DISABLED_RULES).analyze();
}

/**
 * axe's own violation objects are large and mostly noise in a terminal. Report
 * the three things needed to act: which rule broke, how bad, and the exact
 * elements — otherwise a failure sends the reader back to the browser to guess.
 */
function describeViolations(violations: Awaited<ReturnType<typeof scan>>['violations']) {
  return violations
    .map((v) => {
      const nodes = v.nodes.map((n) => `      - ${n.target.join(' ')}\n        ${n.failureSummary?.replace(/\n/g, '\n        ')}`);
      return `  [${v.impact ?? 'unknown'}] ${v.id}: ${v.help}\n    ${v.helpUrl}\n${nodes.join('\n')}`;
    })
    .join('\n\n');
}

async function expectNoViolations(page: Page) {
  const { violations } = await scan(page);
  expect(violations.length, `Accessibility violations found:\n\n${describeViolations(violations)}\n`).toBe(0);
}

test('login page has no WCAG A/AA violations', async ({ page }) => {
  await page.goto('/login');
  // The form is client-rendered inside a Suspense boundary; scanning before it
  // resolves would audit an empty page and pass for the wrong reason.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await expectNoViolations(page);
});

test('authenticated home page has no WCAG A/AA violations', async ({ page }) => {
  await signIn(page);
  await page.goto('/');

  // Wait on rendered UI, not networkidle: SyncProvider holds an EventSource open
  // to /api/sync/stream for the life of the page, so the network never goes idle
  // and that wait would burn the full timeout before failing for the wrong reason.
  await expect(page.getByRole('heading', { name: 'Recent entries' })).toBeVisible();

  await expectNoViolations(page);
});

// The home page's h1 is visually hidden, hence the named-heading wait above;
// these three pages render a visible h1, so the generic wait suffices.
for (const path of ['/events/new', '/reports', '/admin']) {
  test(`${path} has no WCAG A/AA violations`, async ({ page }) => {
    await signIn(page);
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await expectNoViolations(page);
  });
}
