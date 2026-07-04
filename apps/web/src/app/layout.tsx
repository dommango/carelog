import type { Metadata } from 'next';
import { auth, signOut } from '@/auth';
import { getActor } from '@/lib/policy';
import { listPatients } from '@/lib/services/patients';
import './globals.css';

export const metadata: Metadata = {
  title: 'CareLog',
  description: 'Family care activity log',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const user = session?.user;

  let patientName: string | null = null;
  if (user?.id) {
    const actor = await getActor(user.id as string);
    if (actor) {
      const patients = await listPatients(actor);
      patientName = patients[0]?.name ?? null;
    }
  }

  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-gray-50 text-gray-900">
        <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
          <div>
            <div className="font-semibold">{patientName ?? 'CareLog'}</div>
            {user?.name && (
              <div className="text-sm text-gray-500">{user.name}</div>
            )}
          </div>
          {user && (
            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/login' });
              }}
            >
              <button
                type="submit"
                className="text-sm text-red-600 hover:underline"
              >
                Sign out
              </button>
            </form>
          )}
        </header>
        <main className="p-4">{children}</main>
      </body>
    </html>
  );
}
