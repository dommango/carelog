import { describe, it, expect } from 'vitest';
import { EventCategory } from '@carelog/db';
import { buildOnboardingChecklist } from '@/lib/onboarding-checklist';
import { STARTER_TEMPLATES } from '@/lib/starter-templates';

const NOTHING_DONE = { hasEvent: false, hasSchedule: false, hasOtherCaregiver: false };

describe('buildOnboardingChecklist', () => {
  it('counts the profile step as already done for a fresh care circle', () => {
    const checklist = buildOnboardingChecklist(NOTHING_DONE);

    expect(checklist.total).toBe(4);
    expect(checklist.completeCount).toBe(1);
    expect(checklist.isComplete).toBe(false);
    expect(checklist.items.find((i) => i.id === 'profile')?.done).toBe(true);
  });

  it('is complete only when every signal is true', () => {
    const checklist = buildOnboardingChecklist({
      hasEvent: true,
      hasSchedule: true,
      hasOtherCaregiver: true,
    });

    expect(checklist.completeCount).toBe(4);
    expect(checklist.isComplete).toBe(true);
  });

  it('maps each signal to its own item', () => {
    const bySignal = [
      ['hasEvent', 'event'],
      ['hasSchedule', 'schedule'],
      ['hasOtherCaregiver', 'caregiver'],
    ] as const;

    for (const [signal, id] of bySignal) {
      const checklist = buildOnboardingChecklist({ ...NOTHING_DONE, [signal]: true });
      expect(checklist.completeCount).toBe(2); // profile + this one
      expect(checklist.items.find((i) => i.id === id)?.done).toBe(true);
    }
  });

  it('keeps a stable item order', () => {
    expect(buildOnboardingChecklist(NOTHING_DONE).items.map((i) => i.id)).toEqual([
      'profile',
      'event',
      'schedule',
      'caregiver',
    ]);
  });

  // These hrefs depend on the `id` attributes in src/app/admin/page.tsx.
  // If you rename a section anchor there, this test is the tripwire.
  it('points incomplete steps at the screens that complete them', () => {
    const byId = Object.fromEntries(
      buildOnboardingChecklist(NOTHING_DONE).items.map((i) => [i.id, i.href])
    );

    expect(byId.event).toBe('/events/new');
    expect(byId.schedule).toBe('/admin#new-schedule');
    expect(byId.caregiver).toBe('/admin#invite-caregiver');
  });

  it('gives every item a label and a hint', () => {
    for (const item of buildOnboardingChecklist(NOTHING_DONE).items) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.hint.length).toBeGreaterThan(0);
    }
  });
});

describe('STARTER_TEMPLATES', () => {
  it('only uses real event categories', () => {
    const categories = Object.values(EventCategory);
    for (const template of STARTER_TEMPLATES) {
      expect(categories).toContain(template.category);
    }
  });

  // Template has no @@unique([patientId, name]); this stands in for it.
  it('has unique names', () => {
    const names = STARTER_TEMPLATES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  // The guard against seeding invented clinical data — a drug, a dose, a mood
  // baseline — into a real patient's record. See src/lib/starter-templates.ts.
  it('carries no clinical defaults', () => {
    for (const template of STARTER_TEMPLATES) {
      expect(Object.keys(template)).toEqual(['name', 'category']);
    }
  });
});
