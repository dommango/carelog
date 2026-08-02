import { EventCategory } from '@carelog/db';

/**
 * Quick-log shortcuts every new care circle starts with, so the timeline isn't
 * an empty room on day one.
 *
 * `defaults` is `{}` on purpose for all of them. The dev seed
 * (src/scripts/seed.ts) carries shapes like `{ medication: 'Albuterol',
 * dose: '2.5 mg' }`, but those belong to its fictional patient. Inventing a
 * drug, a dose or a mood baseline for a real patient nobody has told us about
 * would write clinical fiction into a medical record. Nothing reads `defaults`
 * today — src/app/events/new/page.tsx uses a template only for its name and
 * category — so empty costs nothing.
 *
 * If you later wire `defaults` into the capture form, keep these empty.
 */
export type StarterTemplate = {
  name: string;
  category: EventCategory;
};

export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
  { name: 'Medication', category: EventCategory.medication },
  { name: 'Vitals', category: EventCategory.vitals },
  { name: 'Meal', category: EventCategory.meal },
  { name: 'Mood', category: EventCategory.mood_behavior },
];
