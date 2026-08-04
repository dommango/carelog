'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/components/Icon';

type Tab = { href: string; label: string; icon: IconName };

const TABS: Tab[] = [
  { href: '/', label: 'Timeline', icon: 'home' },
  { href: '/events/new', label: 'Log', icon: 'plus' },
  { href: '/reports', label: 'Reports', icon: 'chart' },
];

// /admin already refuses non-admins server-side; hiding the tab is about not
// advertising a dead end, not about authorization.
const ADMIN_TAB: Tab = { href: '/admin', label: 'Admin', icon: 'gear' };

export function BottomTabBar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const tabs = isAdmin ? [...TABS, ADMIN_TAB] : TABS;

  return (
    <nav aria-label="Main" className="sticky bottom-0 z-10 flex border-t border-line bg-card">
      {tabs.map((tab) => {
        const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className="flex flex-1 flex-col items-center gap-[3px] py-[11px] pb-[6px] text-[13px] font-extrabold"
            style={{ color: active ? 'var(--accent-deep)' : 'var(--ink-faint)' }}
          >
            <span
              className="flex h-[30px] w-11 items-center justify-center rounded-pill"
              style={{ background: active ? 'var(--accent-tint)' : 'transparent' }}
            >
              <Icon name={tab.icon} size={20} />
            </span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
