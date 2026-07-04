import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';
import { getActor } from '@/lib/policy';
import { listEvents } from '@/lib/services/events';
import { listTemplates } from '@/lib/services/templates';

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

  const [events, templates] = await Promise.all([
    listEvents(actor, { limit: 50 }),
    listTemplates(actor),
  ]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex flex-wrap gap-2">
        {templates.map((template) => (
          <Link
            key={template.id}
            href={`/events/new?templateId=${template.id}`}
            className="px-3 py-1.5 bg-blue-100 text-blue-800 rounded-full text-sm hover:bg-blue-200"
          >
            {template.name}
          </Link>
        ))}
        <Link
          href="/events/new"
          className="px-3 py-1.5 bg-gray-200 text-gray-800 rounded-full text-sm hover:bg-gray-300"
        >
          + Note
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Timeline</h1>
        {actor.role === 'admin' && (
          <Link href="/admin" className="text-sm text-blue-600 hover:underline">
            Admin
          </Link>
        )}
      </div>

      <div className="space-y-3">
        {events.length === 0 && (
          <div className="text-center text-gray-500 py-12">No events yet.</div>
        )}
        {events.map((event) => (
          <div
            key={event.id}
            className="bg-white rounded-lg border p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {event.category ?? 'note'}
              </span>
              <span className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-800">
                {event.status}
              </span>
            </div>
            <p className="mt-2 text-gray-900 whitespace-pre-wrap">{event.rawInput}</p>
            <div className="mt-2 text-sm text-gray-500">
              {event.author.name} · {new Date(event.occurredAt).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
