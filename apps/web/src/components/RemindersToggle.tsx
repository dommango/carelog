'use client';

import { useCallback, useEffect, useState } from 'react';
import { urlBase64ToUint8Array } from '@/lib/push-key';
import { announce } from '@/lib/announcer';

type ReminderState = 'checking' | 'unavailable' | 'off' | 'on' | 'blocked' | 'error';

const BLOCKED_MESSAGE =
  'Reminders are blocked for this site. To turn them on, allow notifications for CareLog in your browser settings, then come back to this page.';

function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'PushManager' in window &&
    'serviceWorker' in navigator
  );
}

async function fetchPublicKey(): Promise<string | null> {
  const res = await fetch('/api/notifications/vapid-public-key');
  if (!res.ok) return null;
  const data = (await res.json()) as { publicKey: string | null };
  return data.publicKey;
}

export function RemindersToggle() {
  const [state, setState] = useState<ReminderState>('checking');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function detect() {
      if (!pushSupported()) {
        setState('unavailable');
        return;
      }
      try {
        const publicKey = await fetchPublicKey();
        if (cancelled) return;
        if (!publicKey) {
          setState('unavailable');
          return;
        }
        if (Notification.permission === 'denied') {
          setState('blocked');
          return;
        }
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (cancelled) return;
        setState(existing && Notification.permission === 'granted' ? 'on' : 'off');
      } catch (error) {
        console.error('Could not check reminder status', error);
        if (!cancelled) setState('unavailable');
      }
    }

    void detect();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'denied') {
        setState('blocked');
        announce(BLOCKED_MESSAGE);
        return;
      }
      if (permission !== 'granted') {
        setState('off');
        return;
      }

      const publicKey = await fetchPublicKey();
      if (!publicKey) {
        setState('unavailable');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));

      const saved = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!saved.ok) throw new Error(`Could not save the reminder settings: ${saved.status}`);

      setState('on');
      announce('Reminders are on for this device.');
    } catch (error) {
      console.error('Could not turn on reminders', error);
      setState('error');
    } finally {
      setBusy(false);
    }
  }, []);

  if (state === 'checking' || state === 'unavailable') return null;

  if (state === 'on') {
    return (
      <p className="px-1 text-[13px] font-semibold text-ink-soft">
        Reminders are on for this device.
      </p>
    );
  }

  if (state === 'blocked') {
    return (
      <section className="cc-card">
        <h2 className="cc-eyebrow mb-[9px]">Reminders</h2>
        <p className="text-[15px] leading-normal text-ink-soft">{BLOCKED_MESSAGE}</p>
      </section>
    );
  }

  return (
    <section className="cc-card">
      <h2 className="cc-eyebrow mb-[9px]">Reminders</h2>
      <p className="text-[15px] leading-normal text-ink-soft">
        CareLog can remind you on this device when something is due — a treatment, a medicine, a
        meal. You can turn them off again in your browser settings.
      </p>
      {state === 'error' && (
        <p className="mt-2 text-[15px] font-semibold leading-normal text-alert">
          Something went wrong turning reminders on. Please try again.
        </p>
      )}
      <button
        type="button"
        onClick={() => void enable()}
        disabled={busy}
        className="cc-btn cc-btn--primary mt-3"
      >
        {busy ? 'Turning on…' : state === 'error' ? 'Try again' : 'Turn on reminders'}
      </button>
    </section>
  );
}
