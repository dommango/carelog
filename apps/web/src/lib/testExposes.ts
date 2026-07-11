'use client';

import { useEffect } from 'react';
import { localDb, getClientId, eventToLocal } from '@/lib/localDb';
import { queueOutbox, drainOutbox } from '@/lib/outbox';
import { pullDelta, getSyncCursor } from '@/lib/sync';

declare global {
  interface Window {
    __CARELOG_TEST__?: {
      localDb: typeof localDb;
      getClientId: typeof getClientId;
      eventToLocal: typeof eventToLocal;
      queueOutbox: typeof queueOutbox;
      drainOutbox: typeof drainOutbox;
      pullDelta: typeof pullDelta;
      getSyncCursor: typeof getSyncCursor;
    };
  }
}

export function useTestExposes() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      window.__CARELOG_TEST__ = {
        localDb,
        getClientId,
        eventToLocal,
        queueOutbox,
        drainOutbox,
        pullDelta,
        getSyncCursor,
      };
    }
  }, []);
}
