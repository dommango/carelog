'use client';

import { useSync } from './SyncProvider';

export function OfflineIndicator() {
  const { online, syncing, syncNow } = useSync();

  return (
    <div className="flex items-center gap-2 text-sm">
      {!online && (
        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded" title="Changes are saved locally and will sync when you are back online">
          Offline
        </span>
      )}
      {online && syncing && (
        <span className="text-gray-500" aria-live="polite">
          Syncing…
        </span>
      )}
      {online && !syncing && (
        <button
          onClick={syncNow}
          className="text-blue-600 hover:underline"
          type="button"
        >
          Sync now
        </button>
      )}
    </div>
  );
}
