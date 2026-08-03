import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import { checkTestLoginAccess } from '@/lib/test-login-gate';

// Development and E2E sign-in only. This mints a session for any email it is
// handed, so it is credential-equivalent and is refused outright in production
// — it is NOT a fallback auth path for a real deployment. See
// checkTestLoginAccess for the full rule.
export async function POST(request: NextRequest) {
  const decision = checkTestLoginAccess({
    nodeEnv: process.env.NODE_ENV,
    expectedSecret: env.TEST_LOGIN_SECRET,
    providedSecret: request.headers.get('x-test-login-secret'),
  });

  if (!decision.allowed) {
    return new Response(decision.message, { status: decision.status });
  }

  const body = await request.json().catch(() => ({})) as { email?: string; name?: string };
  const email = body.email ?? 'admin@carelog.local';
  const name = body.name ?? 'Admin User';

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({ data: { email, name } });
  }

  // Attach to the seeded patient when there is one, so E2E signs in with a
  // populated care circle. With no patient, sign in anyway and leave the user
  // unassigned — that is a real signup state, and the only way to reach the
  // onboarding flow in development.
  const patient = await prisma.patient.findFirst({ orderBy: { createdAt: 'asc' } });
  if (patient) {
    await prisma.caregiverAssignment.upsert({
      where: { userId_patientId: { userId: user.id, patientId: patient.id } },
      update: {},
      create: { userId: user.id, patientId: patient.id, role: 'admin' },
    });
  }

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
  // so the manually-created session is recognized in production too. Derived
  // from the actual request (not an env var) so it's correct behind Railway's
  // proxy regardless of which URL env var is set.
  const useSecure =
    request.nextUrl.protocol === 'https:' ||
    request.headers.get('x-forwarded-proto') === 'https';
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
