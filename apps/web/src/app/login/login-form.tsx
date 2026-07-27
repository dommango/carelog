'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Icon } from '@/components/Icon';

export default function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const isDev = process.env.NODE_ENV === 'development';
  const params = useSearchParams();
  const error = params.get('error');

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="mb-11 flex items-center gap-[11px]">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-caregiver text-white">
          <Icon name="cal" size={21} />
        </span>
        <span className="cc-serif text-2xl">
          Care<span className="text-caregiver-ink">Log</span>
        </span>
      </div>

      <h1 className="cc-serif mb-3 text-[30px] leading-[1.2]">
        Keep everyone&apos;s care in one calm place.
      </h1>
      <p className="mb-8 text-[15px] font-semibold leading-normal text-ink-soft">
        Sign in and we&apos;ll pick up right where the family left off this morning.
      </p>

      {error && (
        <div className="mb-4 rounded-[14px] border border-alert-tint bg-alert-tint p-3 text-sm text-accent-deep">
          Sign-in error: {error}
        </div>
      )}

      {googleEnabled && (
        <>
          <button
            onClick={() => signIn('google', { callbackUrl: '/' })}
            className="cc-btn cc-btn--primary cc-btn--block cc-btn--xl"
          >
            Continue with Google
          </button>

          <div className="cc-note cc-note--calm mt-4">
            <span className="cc-note-ic">
              <Icon name="check" size={16} />
            </span>
            <span>
              No password to remember. Google keeps your account secure, and we&apos;ll pick up
              right where you left off.
            </span>
          </div>
        </>
      )}

      {isDev && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            // Not signIn('credentials') — credentials sign-in requires the JWT
            // session strategy, and this app uses database sessions. This route
            // writes the Session row directly.
            const res = await fetch('/api/auth/test-login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: formData.get('email') as string,
                name: formData.get('name') as string,
              }),
            });
            if (res.ok) {
              window.location.href = '/';
            } else {
              alert(`Sign in failed: ${await res.text()}`);
            }
          }}
          className="mt-8 space-y-3 border-t border-line pt-6"
        >
          <span className="cc-eyebrow">Development sign-in</span>
          <input name="email" type="email" placeholder="Email" required className="cc-input" />
          <input name="name" type="text" placeholder="Name" required className="cc-input" />
          <button type="submit" className="cc-btn cc-btn--secondary cc-btn--block">
            Dev sign in
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-[12.5px] font-bold text-ink-faint">
        {googleEnabled
          ? 'New here? Sign in to set up a care circle, or to join one you were invited to.'
          : 'Google sign-in is not configured for this environment.'}
      </p>
    </div>
  );
}
