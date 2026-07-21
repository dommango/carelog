import { EventCategory, EventStatus } from '@carelog/db';
import type { IconName } from '@/components/Icon';

export type TierNumber = 0 | 1 | 2 | 3;

export const CATEGORY_META: Record<EventCategory, { label: string; tier: TierNumber; icon: IconName }> = {
  [EventCategory.medication]: { label: 'Medication', tier: 0, icon: 'pill' },
  [EventCategory.nebulizer_treatment]: { label: 'Nebulizer', tier: 1, icon: 'sun' },
  [EventCategory.meal]: { label: 'Meal', tier: 2, icon: 'sun' },
  [EventCategory.hydration]: { label: 'Hydration', tier: 1, icon: 'sun' },
  [EventCategory.mood_behavior]: { label: 'Mood', tier: 3, icon: 'heart' },
  [EventCategory.vitals]: { label: 'Vitals', tier: 1, icon: 'chart' },
  [EventCategory.sleep]: { label: 'Sleep', tier: 3, icon: 'clock' },
  [EventCategory.activity]: { label: 'Activity', tier: 2, icon: 'hand' },
  [EventCategory.incident]: { label: 'Incident', tier: 0, icon: 'flag' },
  [EventCategory.observation_other]: { label: 'Note', tier: 1, icon: 'bell' },
  [EventCategory.toileting]: { label: 'Toileting', tier: 2, icon: 'hand' },
};

export function categoryMeta(category: string | null | undefined) {
  if (category && category in CATEGORY_META) {
    return CATEGORY_META[category as EventCategory];
  }
  return { label: category ?? 'Note', tier: 1 as TierNumber, icon: 'bell' as IconName };
}

export const STATUS_META: Record<EventStatus, { kind: 'await' | 'attention' | 'covered' | 'gap'; label: string }> = {
  [EventStatus.pending_ai]: { kind: 'await', label: 'Reading…' },
  [EventStatus.needs_review]: { kind: 'attention', label: 'Needs review' },
  [EventStatus.confirmed]: { kind: 'covered', label: 'Confirmed' },
  [EventStatus.ai_failed]: { kind: 'gap', label: "Couldn't read" },
};

export function tierStyle(tier: TierNumber): React.CSSProperties {
  return {
    background: `var(--tier-${tier}-tint)`,
    color: `var(--tier-${tier}-ink)`,
  };
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
