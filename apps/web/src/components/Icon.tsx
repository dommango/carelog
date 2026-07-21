/**
 * Design-system icon set. 24x24 viewBox, round-cap strokes, currentColor —
 * no emoji, no icon font. Paths for cal/send/check/sun/pill/chart/home/plus/
 * chevL/phone/bell come directly from the design handoff mock; the rest are
 * drawn in the same style since they weren't included in the bundle.
 */

const PATHS: Record<string, { strokeWidth?: number; children: React.ReactNode }> = {
  cal: {
    children: (
      <>
        <rect x="3.5" y="5" width="17" height="16" rx="3" />
        <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      </>
    ),
  },
  clock: {
    children: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3.5 2" />
      </>
    ),
  },
  phone: {
    children: (
      <>
        <path d="M6.5 3.5h11a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5Z" />
        <path d="M10.5 17.5h3" />
      </>
    ),
  },
  bell: {
    children: (
      <>
        <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
        <path d="M10 19a2 2 0 0 0 4 0" />
      </>
    ),
  },
  check: {
    strokeWidth: 2.4,
    children: <path d="M5 12.5l4.5 4.5L19 7" />,
  },
  plus: {
    strokeWidth: 2.2,
    children: <path d="M12 5v14M5 12h14" />,
  },
  heart: {
    children: (
      <path d="M12 20.5s-7.5-4.6-10-9C.6 8 2 4.3 5.6 3.6c2.3-.4 4.6.8 6.4 3 1.8-2.2 4.1-3.4 6.4-3 3.6.7 5 4.4 3.6 7.9-2.5 4.4-10 9-10 9z" />
    ),
  },
  users: {
    children: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 19c.7-3.3 2.9-5.1 6-5.1s5.3 1.8 6 5.1" />
        <circle cx="17.5" cy="9" r="2.2" />
        <path d="M15.8 14c1.9.4 3.3 1.9 3.7 4.1" />
      </>
    ),
  },
  hand: {
    children: (
      <>
        <path d="M7 12.5V6a1.4 1.4 0 1 1 2.8 0v5.5" />
        <path d="M9.8 11V4.6a1.4 1.4 0 1 1 2.8 0V11" />
        <path d="M12.6 11.2V6a1.4 1.4 0 1 1 2.8 0v6.3" />
        <path d="M15.4 13V9.4a1.4 1.4 0 1 1 2.8 0v6c0 3.3-2 6.1-5.6 6.1h-1c-2.6 0-4-.9-5.3-2.8L4 14.8c-.6-.9-.3-1.9.5-2.4.8-.5 1.7-.2 2.3.6l1.2 1.6" />
      </>
    ),
  },
  flag: {
    children: (
      <>
        <path d="M5 21V4" />
        <path d="M5 5c1.6-1 3.4-1 5 0s3.4 1 5 0v9c-1.6 1-3.4 1-5 0s-3.4-1-5 0" />
      </>
    ),
  },
  chevR: {
    strokeWidth: 2.1,
    children: <path d="M9 5l7 7-7 7" />,
  },
  chevL: {
    strokeWidth: 2.1,
    children: <path d="M15 5l-7 7 7 7" />,
  },
  x: {
    strokeWidth: 2.1,
    children: <path d="M6 6l12 12M18 6L6 18" />,
  },
  send: {
    children: (
      <>
        <path d="M21 4 3 11l7 2 2 7 9-16Z" />
        <path d="M10 13 21 4" />
      </>
    ),
  },
  sun: {
    children: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19" />
      </>
    ),
  },
  home: {
    children: (
      <>
        <path d="M4 11.5 12 4l8 7.5" />
        <path d="M6 10v10h12V10" />
      </>
    ),
  },
  chart: {
    children: (
      <>
        <path d="M4 20V4M4 20h16" />
        <path d="M8 16v-4M12 16V8M16 16v-6" />
      </>
    ),
  },
  pill: {
    children: (
      <>
        <rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-45 12 12)" />
        <path d="M8.5 8.5 15.5 15.5" />
      </>
    ),
  },
  gear: {
    children: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v2.5M12 18.5V21M21 12h-2.5M5.5 12H3M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8M18.4 18.4l-1.8-1.8M7.4 7.4 5.6 5.6" />
      </>
    ),
  },
};

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 24,
  strokeWidth,
  className,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const spec = PATHS[name];
  if (!spec) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth ?? spec.strokeWidth ?? 1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {spec.children}
    </svg>
  );
}
