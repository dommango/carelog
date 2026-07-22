import NextAuth, { type NextAuthConfig } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Google from 'next-auth/providers/google';
import Nodemailer from 'next-auth/providers/nodemailer';
import Credentials from 'next-auth/providers/credentials';
import { createTransport } from 'nodemailer';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { env, googleEnabled, emailEnabled } from '@/lib/env';

const credentialsSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

async function ensureDevAssignment(userId: string) {
  const patient = await prisma.patient.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!patient) return;
  await prisma.caregiverAssignment.upsert({
    where: { userId_patientId: { userId, patientId: patient.id } },
    update: {},
    create: { userId, patientId: patient.id, role: 'admin' },
  });
}

const providers: NextAuthConfig['providers'] = [];

if (googleEnabled) {
  providers.push(
    Google({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    })
  );
}

if (emailEnabled) {
  providers.push(
    Nodemailer({
      server: env.EMAIL_SERVER,
      from: env.EMAIL_FROM,
      async sendVerificationRequest({ identifier, url, provider }) {
        const transport = createTransport(provider.server);
        await transport.sendMail({
          to: identifier,
          from: provider.from,
          subject: 'Sign in to CareLog',
          text: `Click the link to sign in to CareLog:\n\n${url}\n\n`,
          html: `<p>Click <a href="${url}">here</a> to sign in to CareLog.</p>`,
        });
      },
    })
  );
}

if (process.env.NODE_ENV === 'development') {
  providers.push(
    Credentials({
      name: 'Development',
      credentials: {
        email: { label: 'Email', type: 'email' },
        name: { label: 'Name', type: 'text' },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, name } = parsed.data;
        let user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          user = await prisma.user.create({
            data: { email, name },
          });
        }
        await ensureDevAssignment(user.id);
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    })
  );
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  adapter: PrismaAdapter(prisma) as any,
  // Auth.js infers its origin from the request; required behind Railway's proxy.
  trustHost: true,
  session: { strategy: 'database', maxAge: 30 * 24 * 60 * 60 },
  pages: {
    signIn: '/login',
    // Required, not optional: with pages.signIn set, Auth.js v5 throws
    // UnknownAction ("Cannot handle action: verify-request") rendering the
    // built-in page after a magic-link send unless this is pointed somewhere.
    verifyRequest: '/verify-request',
  },
  providers,
  callbacks: {
    async session({ session, user }) {
      if (session.user && user) {
        (session.user as any).id = user.id;
      }
      return session;
    },
  },
  events: {
    // Google (and any future OAuth provider) only ever returns a
    // provider-verified email, but the Prisma adapter doesn't populate
    // emailVerified for OAuth sign-ins — only the magic-link provider does.
    // Stamp it here so a future "verified email required" gate doesn't
    // silently exclude every OAuth user. Guarded on null so an existing
    // stamp is never clobbered.
    async signIn({ user, account }) {
      if (!user?.id || account?.provider !== 'google') return;
      await prisma.user.updateMany({
        where: { id: user.id, emailVerified: null },
        data: { emailVerified: new Date() },
      });
    },
  },
});
