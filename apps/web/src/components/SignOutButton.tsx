'use client';

import { useEffect, useRef, useState } from 'react';

export function SignOutButton({ signOutAction }: { signOutAction: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!confirming) return;

    confirmRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setConfirming(false);
      triggerRef.current?.focus();
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setConfirming(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [confirming]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setConfirming((prev) => !prev)}
        aria-expanded={confirming}
        aria-haspopup="dialog"
        className="cc-btn cc-btn--ghost cc-btn--sm whitespace-nowrap"
      >
        Sign out
      </button>

      {confirming && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Sign out of CareLog"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(19rem,calc(100vw-2rem))] rounded-card border border-line bg-card p-4 shadow-lg"
        >
          <p className="text-[15px] font-semibold leading-snug text-ink">
            Sign out of CareLog on this device?
          </p>
          <p className="mt-1 text-[13px] leading-snug text-ink-soft">
            Anything you have logged is already saved. You will need to sign in again to log
            anything new.
          </p>
          <div className="mt-3 flex gap-2">
            <form action={signOutAction} className="flex-1">
              <button ref={confirmRef} type="submit" className="cc-btn cc-btn--primary cc-btn--block">
                Yes, sign out
              </button>
            </form>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                triggerRef.current?.focus();
              }}
              className="cc-btn cc-btn--ghost flex-1"
            >
              Stay signed in
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
