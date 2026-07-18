'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';

export default function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const isDev = process.env.NODE_ENV === 'development';
  const params = useSearchParams();
  const error = params.get('error');

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">CareLog</h1>
        <p className="text-sm text-gray-500 mt-1">Sign in to continue</p>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Sign-in error: {error}
        </div>
      )}

      {googleEnabled && (
        <button
          onClick={() => signIn('google', { callbackUrl: '/' })}
          className="w-full bg-white border py-2.5 rounded shadow-sm hover:bg-gray-50"
        >
          Sign in with Google
        </button>
      )}

      {isDev && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const result = await signIn('credentials', {
              email: formData.get('email') as string,
              name: formData.get('name') as string,
              redirect: false,
            });
            if (result?.ok) {
              window.location.href = '/';
            } else {
              alert(result?.error ?? 'Sign in failed');
            }
          }}
          className="space-y-3 pt-4 border-t"
        >
          <p className="text-sm text-gray-500">Development credentials sign-in</p>
          <input
            name="email"
            type="email"
            placeholder="Email"
            required
            className="w-full border rounded p-2"
          />
          <input
            name="name"
            type="text"
            placeholder="Name"
            required
            className="w-full border rounded p-2"
          />
          <button
            type="submit"
            className="w-full bg-gray-800 text-white py-2 rounded hover:bg-gray-900"
          >
            Dev sign in
          </button>
        </form>
      )}

      <p className="text-xs text-gray-500 text-center">
        {googleEnabled
          ? 'Production uses Google sign-in or a magic link.'
          : 'Google sign-in is not configured for this environment.'}
      </p>
    </div>
  );
}
