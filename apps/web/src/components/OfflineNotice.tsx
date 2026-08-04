'use client';

import { useSync } from './SyncProvider';

export function OfflineNotice() {
  const { online, syncError } = useSync();

  if (!online) {
    return (
      <p className="border-b border-line bg-gap-tint px-4 py-2 text-[14px] font-semibold leading-snug text-gap-ink">
        You are offline. Anything you log is saved on this device and will send on its own when
        you are back online.
      </p>
    );
  }

  if (syncError) {
    return (
      <p className="border-b border-line bg-alert-tint px-4 py-2 text-[14px] font-semibold leading-snug text-accent-deep">
        Some changes have not synced yet. They are saved on this device, and CareLog will keep
        trying.
      </p>
    );
  }

  return null;
}
