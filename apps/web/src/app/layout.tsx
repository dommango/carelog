import type { Metadata } from 'next';
import { Mulish, Newsreader } from 'next/font/google';
import { auth, signOut } from '@/auth';
import { getActor } from '@/lib/policy';
import { listPatients } from '@/lib/services/patients';
import { SyncProvider } from '@/components/SyncProvider';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { TestExposes } from '@/components/TestExposes';
import { BottomTabBar } from '@/components/BottomTabBar';
import { Icon } from '@/components/Icon';
import './globals.css';

const mulish = Mulish({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-mulish',
  display: 'swap',
});

const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-newsreader',
  display: 'swap',
});

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
    <html lang="en" className={`h-full ${mulish.variable} ${newsreader.variable}`}>
      <body className="cc min-h-full bg-sand">
        <SyncProvider>
          <TestExposes />
          {user ? (
            <div className="flex min-h-full flex-col">
              <header className="flex items-center justify-between border-b border-line bg-card px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-caregiver text-white">
                    <Icon name="cal" size={17} />
                  </span>
                  <div className="leading-tight">
                    <div className="cc-serif text-[18px]">{patientName ?? 'CareLog'}</div>
                    <div className="text-xs font-bold text-ink-faint">
                      Care<span className="text-caregiver-ink">Log</span>
                      {user.name ? ` · ${user.name}` : ''}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <OfflineIndicator />
                  <form
                    action={async () => {
                      'use server';
                      await signOut({ redirectTo: '/login' });
                    }}
                  >
                    <button type="submit" className="cc-btn cc-btn--ghost cc-btn--sm">
                      Sign out
                    </button>
                  </form>
                </div>
              </header>
              <main className="flex-1 px-4 py-[18px] pb-24">{children}</main>
              <BottomTabBar />
            </div>
          ) : (
            <main className="min-h-full">{children}</main>
          )}
        </SyncProvider>
      </body>
    </html>
  );
}
