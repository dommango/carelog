'use client';

import { useSync } from './SyncProvider';

export function OfflineIndicator() {
  const { online, syncing, syncError, syncNow } = useSync();

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
      <span className="cc-badge cc-badge--await">
        <span className="cc-dot" />
        Syncing…
      </span>
    );
  }

  if (syncError) {
    return (
      <button
        onClick={syncNow}
        type="button"
        aria-label="Not synced — try syncing again now"
        className="cc-badge cc-badge--attention"
      >
        <span className="cc-dot" />
        Not synced
      </button>
    );
  }

  return (
    <button
      onClick={syncNow}
      type="button"
      aria-label="Synced — check for new changes now"
      className="cc-badge cc-badge--covered"
    >
      <span className="cc-dot" />
      Synced
    </button>
  );
}
