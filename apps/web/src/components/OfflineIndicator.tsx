'use client';

import { useSync } from './SyncProvider';

export function OfflineIndicator() {
  const { online, syncing, syncNow } = useSync();

  if (!online) {
    return (
      <span className="cc-badge cc-badge--gap">
        <span className="cc-dot" />
        Offline
      </span>
    );
  }

  if (syncing) {
    return (
      <span className="cc-badge cc-badge--await" aria-live="polite">
        <span className="cc-dot" />
        Syncing…
      </span>
    );
  }

  return (
    <button onClick={syncNow} type="button" className="cc-badge cc-badge--covered">
      <span className="cc-dot" />
      Synced
    </button>
  );
}
