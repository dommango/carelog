import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

// Test-only login used by Playwright E2E tests, and as the interim auth path
// for deployments without Google OAuth wired up. Enabled in development, or
// anywhere ENABLE_TEST_LOGIN is explicitly set (opt-in backdoor — off by default).
export async function POST(request: NextRequest) {
  const enabled =
    process.env.NODE_ENV === 'development' || process.env.ENABLE_TEST_LOGIN === 'true';
  if (!enabled) {
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

  // Auth.js uses a secure-prefixed cookie name over HTTPS; match its convention
  // so the manually-created session is recognized in production too.
  const useSecure = (process.env.NEXTAUTH_URL ?? '').startsWith('https://');
  const cookieName = useSecure ? '__Secure-authjs.session-token' : 'authjs.session-token';
  const cookieStore = await cookies();
  cookieStore.set(cookieName, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: useSecure,
    expires,
  });

  return Response.json({ ok: true, userId: user.id });
}
