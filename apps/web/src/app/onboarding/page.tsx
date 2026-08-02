import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getActor } from '@/lib/policy';
import PatientForm from './patient-form';

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const actor = await getActor(session.user.id as string);
  if (actor) {
    redirect('/');
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <div>
        <h1 className="cc-serif text-[26px] leading-[1.2]">Set up the care profile</h1>
        <p className="mt-2 text-[15px] font-semibold leading-normal text-ink-soft">
          Every log, reminder and report lives under one person. Create their profile and
          you&apos;ll be set up as the admin of their care circle.
        </p>
      </div>

      <section className="cc-card">
        <PatientForm today={new Date().toISOString().slice(0, 10)} />
      </section>
    </div>
  );
}
