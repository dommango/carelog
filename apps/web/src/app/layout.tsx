import type { Metadata } from 'next';
import { Mulish, Newsreader } from 'next/font/google';
import { auth, signOut } from '@/auth';
import { getActor } from '@/lib/policy';
import { listPatients } from '@/lib/services/patients';
import { SyncProvider } from '@/components/SyncProvider';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { OfflineNotice } from '@/components/OfflineNotice';
import { StatusAnnouncer } from '@/components/StatusAnnouncer';
import { SignOutButton } from '@/components/SignOutButton';
import { TestExposes } from '@/components/TestExposes';
import { BottomTabBar } from '@/components/BottomTabBar';
import { FeedbackWidget } from '@/components/FeedbackWidget';
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
  let hasCareCircle = false;
  let isAdmin = false;
  if (user?.id) {
    const actor = await getActor(user.id as string);
    if (actor) {
      hasCareCircle = true;
      isAdmin = actor.role === 'admin';
      const patients = await listPatients(actor);
      patientName = patients[0]?.name ?? null;
    }
  }

  return (
    <html lang="en" className={`h-full ${mulish.variable} ${newsreader.variable}`}>
      <body className="cc min-h-full bg-sand">
        <SyncProvider>
          <TestExposes />
          <StatusAnnouncer />
          {user ? (
            <div className="flex min-h-full flex-col">
              <header className="flex items-center justify-between border-b border-line bg-card px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-caregiver text-white">
                    <Icon name="cal" size={17} />
                  </span>
                  <div className="min-w-0 leading-tight">
                    <div className="cc-serif truncate text-[18px]">{patientName ?? 'CareLog'}</div>
                    <div className="truncate text-xs font-bold text-ink-faint">
                      Care<span className="text-caregiver-ink">Log</span>
                      {user.name ? ` · ${user.name}` : ''}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                  <OfflineIndicator />
                  <SignOutButton
                    signOutAction={async () => {
                      'use server';
                      await signOut({ redirectTo: '/login' });
                    }}
                  />
                </div>
              </header>
              <OfflineNotice />
              <main className="flex-1 px-4 py-[18px] pb-24">{children}</main>
              {hasCareCircle && <BottomTabBar isAdmin={isAdmin} />}
            </div>
          ) : (
            <main className="min-h-full">{children}</main>
          )}
          {/* Mounted outside the signed-in branch: the submit route accepts
              anonymous reports, so sign-in problems can be reported too. */}
          <FeedbackWidget userEmail={user?.email ?? null} />
        </SyncProvider>
      </body>
    </html>
  );
}
