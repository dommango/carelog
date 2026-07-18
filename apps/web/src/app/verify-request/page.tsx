import Link from 'next/link';

export default function VerifyRequestPage() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold">Check your email</h1>
          <p className="text-sm text-gray-500 mt-2">
            A sign-in link has been sent to your email address. Open it on this device to
            continue.
          </p>
        </div>

        <p className="text-xs text-gray-500">
          The link expires shortly and can only be used once. If it does not arrive, check your
          spam folder.
        </p>

        <Link href="/login" className="inline-block text-sm underline hover:text-gray-700">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
