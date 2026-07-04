'use client';

import { signIn } from 'next-auth/react';

export default function LoginPage() {
  const isDev = process.env.NODE_ENV === 'development';

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">CareLog</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to continue</p>
        </div>

        <button
          onClick={() => signIn('google', { callbackUrl: '/' })}
          className="w-full bg-white border py-2.5 rounded shadow-sm hover:bg-gray-50"
        >
          Sign in with Google
        </button>

        {isDev && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              await signIn('credentials', {
                email: formData.get('email') as string,
                name: formData.get('name') as string,
                callbackUrl: '/',
                redirect: true,
              });
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
          Production uses Google sign-in or a magic link.
        </p>
      </div>
    </div>
  );
}
