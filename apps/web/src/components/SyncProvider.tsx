'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { startOutboxDrain, drainOutbox } from '@/lib/outbox';
import { startDeltaSync, pullDelta } from '@/lib/sync';
import { isOnline } from '@/lib/localDb';
import { announce } from '@/lib/announcer';

interface SyncContextValue {
  online: boolean;
  syncing: boolean;
  syncError: boolean;
  syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

const SYNCED_MESSAGE = 'Everything is saved and up to date.';
const FAILED_MESSAGE =
  'Syncing did not finish. Your notes are saved on this device and CareLog will keep trying.';
const OFFLINE_MESSAGE =
  'You are offline. Anything you log is saved on this device and will sync when you are back online.';
const RECONNECTED_MESSAGE = 'You are back online. Everything is synced.';
const RECONNECTED_FAILED_MESSAGE =
  'You are back online, but syncing did not finish. Your notes are saved on this device.';

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState(isOnline());
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const failingRef = useRef(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Background syncs stay silent unless the outcome changed, so a screen reader
  // is not read a status line on every poll. Passing `messages` marks the sync
  // as one the user asked for or would otherwise not know happened.
  const runSync = useCallback(async (messages?: { ok: string; failed: string }) => {
    setSyncing(true);
    try {
      await drainOutbox();
      await pullDelta();
      const wasFailing = failingRef.current;
      failingRef.current = false;
      setSyncError(false);
      if (messages) announce(messages.ok);
      else if (wasFailing) announce(SYNCED_MESSAGE);
    } catch (error) {
      console.error('Sync failed', error);
      const wasFailing = failingRef.current;
      failingRef.current = true;
      setSyncError(true);
      if (messages) announce(messages.failed);
      else if (!wasFailing) announce(FAILED_MESSAGE);
    } finally {
      setSyncing(false);
    }
  }, []);

  const syncNow = useCallback(
    () => runSync({ ok: SYNCED_MESSAGE, failed: FAILED_MESSAGE }),
    [runSync]
  );

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      void runSync({ ok: RECONNECTED_MESSAGE, failed: RECONNECTED_FAILED_MESSAGE });
    };
    const handleOffline = () => {
      setOnline(false);
      announce(OFFLINE_MESSAGE);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [runSync]);

  useEffect(() => {
    const stopOutbox = startOutboxDrain();
    const stopDelta = startDeltaSync();

    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'DRAIN_OUTBOX') {
        drainOutbox().catch((err) => console.error('SW drain failed', err));
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleSwMessage);

    eventSourceRef.current = new EventSource('/api/sync/stream');
    eventSourceRef.current.addEventListener('changed', () => {
      void runSync();
    });
    eventSourceRef.current.onerror = (err) => {
      console.error('SSE error', err);
    };

    return () => {
      stopOutbox();
      stopDelta();
      navigator.serviceWorker?.removeEventListener('message', handleSwMessage);
      eventSourceRef.current?.close();
    };
  }, [runSync]);

  return (
    <SyncContext.Provider value={{ online, syncing, syncError, syncNow }}>
      {children}
    </SyncContext.Provider>
  );
}
