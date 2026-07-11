'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { startOutboxDrain, drainOutbox } from '@/lib/outbox';
import { startDeltaSync, pullDelta } from '@/lib/sync';
import { isOnline } from '@/lib/localDb';

interface SyncContextValue {
  online: boolean;
  syncing: boolean;
  syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState(isOnline());
  const [syncing, setSyncing] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await drainOutbox();
      await pullDelta();
    } catch (err) {
      console.error('Manual sync failed', err);
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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
      pullDelta().catch((err) => console.error('SSE pull failed', err));
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
  }, []);

  return (
    <SyncContext.Provider value={{ online, syncing, syncNow }}>
      {children}
    </SyncContext.Provider>
  );
}
