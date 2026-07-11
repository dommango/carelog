import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { getActor } from '@/lib/policy';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const actor = await getActor(session.user.id as string);
  if (!actor) {
    return new Response('Forbidden', { status: 403 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('event: connected\ndata: {}\n\n'));

      const interval = setInterval(() => {
        if (closed) {
          clearInterval(interval);
          return;
        }
        try {
          controller.enqueue(encoder.encode('event: changed\ndata: {"changed":true}\n\n'));
        } catch {
          clearInterval(interval);
        }
      }, 5000);

      request.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
