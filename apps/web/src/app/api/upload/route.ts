import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { getStorage } from '@carelog/storage';

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  if (!key) {
    return new Response('Missing key', { status: 400 });
  }

  const contentType = request.headers.get('content-type') ?? 'application/octet-stream';
  const body = Buffer.from(await request.arrayBuffer());

  const storage = getStorage();
  await storage.putObject(key, body, contentType);

  return new Response(null, { status: 204 });
}
