import type { IconName } from '@/components/Icon';

/**
 * The "finish setting up" checklist shown on the timeline until a new care
 * circle is actually usable. State is derived from data on every render —
 * there is no stored dismissal, so it is always honest and always correct
 * after a device switch.
 *
 * Kept separate from the component so the logic is testable without a DOM:
 * vitest here runs `environment: 'node'` over `src/**\/*.test.ts`.
 */
export type ChecklistItemId = 'profile' | 'event' | 'schedule' | 'caregiver';

export type ChecklistItem = {
  id: ChecklistItemId;
  label: string;
  hint: string;
  href: string;
  icon: IconName;
  done: boolean;
};

export type OnboardingChecklist = {
  items: ChecklistItem[];
  completeCount: number;
  total: number;
  isComplete: boolean;
};

export type ChecklistSignals = {
  hasEvent: boolean;
  hasSchedule: boolean;
  hasOtherCaregiver: boolean;
};

export function buildOnboardingChecklist(signals: ChecklistSignals): OnboardingChecklist {
  const items: ChecklistItem[] = [
    {
      id: 'profile',
      label: 'Create the care profile',
      hint: 'Done when you signed up.',
      href: '/admin',
      icon: 'heart',
      done: true,
    },
    {
      id: 'event',
      label: 'Log your first care event',
      hint: 'One line is enough — CareLog sorts out the details.',
      href: '/events/new',
      icon: 'plus',
      done: signals.hasEvent,
    },
    {
      id: 'schedule',
      // The schedule signal comes from listSchedules, which excludes paused
      // schedules. Pausing the only one brings this item back, which is
      // correct: no active schedule means no reminders and no adherence data.
      label: 'Set a daily schedule',
      hint: 'Reminders and adherence tracking start here.',
      href: '/admin#new-schedule',
      icon: 'clock',
      done: signals.hasSchedule,
    },
    {
      id: 'caregiver',
      label: 'Invite a caregiver',
      hint: 'Share the log with whoever else helps out.',
      href: '/admin#invite-caregiver',
      icon: 'users',
      done: signals.hasOtherCaregiver,
    },
  ];

  const completeCount = items.filter((item) => item.done).length;

  return {
    items,
    completeCount,
    total: items.length,
    isComplete: completeCount === items.length,
  };
}
