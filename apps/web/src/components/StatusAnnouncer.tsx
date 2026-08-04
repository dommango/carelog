'use client';

import { useEffect, useState } from 'react';
import { subscribeToAnnouncements } from '@/lib/announcer';

export function StatusAnnouncer() {
  const [announcement, setAnnouncement] = useState({ message: '', seq: 0 });

  useEffect(
    () =>
      subscribeToAnnouncements((message) => {
        setAnnouncement((prev) => ({ message, seq: prev.seq + 1 }));
      }),
    []
  );

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {/* Keyed on seq so repeating the same message still mutates the DOM —
          without that, screen readers stay silent the second time. */}
      <span key={announcement.seq}>{announcement.message}</span>
    </div>
  );
}
