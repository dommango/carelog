import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

// Test-only login used by Playwright E2E tests.
// Only available in development.
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return new Response('Forbidden', { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { email?: string; name?: string };
  const email = body.email ?? 'admin@carelog.local';
  const name = body.name ?? 'Admin User';

  const patient = await prisma.patient.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!patient) {
    return new Response('No patient seeded', { status: 500 });
  }

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({ data: { email, name } });
  }

  await prisma.caregiverAssignment.upsert({
    where: { userId_patientId: { userId: user.id, patientId: patient.id } },
    update: {},
    create: { userId: user.id, patientId: patient.id, role: 'admin' },
  });

  // Create a database session directly.
  const sessionToken = crypto.randomUUID();
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: {
      sessionToken,
      userId: user.id,
      expires,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set('authjs.session-token', sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: false,
    expires,
  });

  return Response.json({ ok: true, userId: user.id });
}
