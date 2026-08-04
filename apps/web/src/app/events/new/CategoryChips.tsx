'use client';

import { EventCategory } from '@carelog/db';
import { Icon } from '@/components/Icon';
import { categoryMeta } from '@/lib/categoryTheme';

const categories = Object.values(EventCategory);

type CategoryChipsProps = {
  labelId: string;
  value: string;
  onChange: (category: string) => void;
};

export function CategoryChips({ labelId, value, onChange }: CategoryChipsProps) {
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-[7px]">
      {categories.map((c) => {
        const meta = categoryMeta(c);
        const active = value === c;
        return (
          <button
            key={c}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? '' : c)}
            className={`cc-btn cc-btn--sm ${active ? 'cc-btn--primary' : 'cc-btn--secondary'}`}
          >
            <Icon name={meta.icon} size={14} />
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}
