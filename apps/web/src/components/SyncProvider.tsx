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

interface OutcomeMessages {
  ok: string;
  failed: string;
}

const SyncContext = createContext<SyncContextValue | null>(null);

const SYNCED_MESSAGE = 'Everything is saved and up to date.';
const FAILED_MESSAGE =
  'Syncing did not finish. Your notes are saved on this device and CareLog will keep trying.';
const OFFLINE_MESSAGE =
  'You are offline. Anything you log is saved on this device and will send when you are back online.';
const RECONNECT_MESSAGES: OutcomeMessages = {
  ok: 'You are back online. Your changes have been sent.',
  failed: 'You are back online, but sending did not finish. Your notes are saved on this device.',
};

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

  // Background syncs run every few seconds, so they only speak when the outcome
  // changes. `messages` marks a sync the user started or would not otherwise
  // know had happened, which is always worth one line.
  const markOutcome = useCallback((ok: boolean, messages?: OutcomeMessages) => {
    const wasFailing = failingRef.current;
    failingRef.current = !ok;
    setSyncError(!ok);

    if (messages) {
      announce(ok ? messages.ok : messages.failed);
      return;
    }
    if (ok && wasFailing) announce(SYNCED_MESSAGE);
    if (!ok && !wasFailing) announce(FAILED_MESSAGE);
  }, []);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await drainOutbox();
      await pullDelta();
      markOutcome(true, { ok: SYNCED_MESSAGE, failed: FAILED_MESSAGE });
    } catch (error) {
      console.error('Manual sync failed', error);
      markOutcome(false, { ok: SYNCED_MESSAGE, failed: FAILED_MESSAGE });
    } finally {
      setSyncing(false);
    }
  }, [markOutcome]);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      setSyncing(true);
      drainOutbox()
        .then(() => markOutcome(true, RECONNECT_MESSAGES))
        .catch((error) => {
          console.error('Reconnect sync failed', error);
          markOutcome(false, RECONNECT_MESSAGES);
        })
        .finally(() => setSyncing(false));
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
  }, [markOutcome]);

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
      pullDelta()
        .then(() => markOutcome(true))
        .catch((err) => {
          console.error('SSE pull failed', err);
          markOutcome(false);
        });
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
  }, [markOutcome]);

  return (
    <SyncContext.Provider value={{ online, syncing, syncError, syncNow }}>
      {children}
    </SyncContext.Provider>
  );
}
