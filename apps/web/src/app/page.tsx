import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getActor } from '@/lib/policy';
import Timeline from '@/components/Timeline';

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const actor = await getActor(session.user.id as string);
  if (!actor) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        You do not have access to a patient profile yet.
      </div>
    );
  }

  return <Timeline />;
}
