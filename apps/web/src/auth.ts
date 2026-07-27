import NextAuth, { type NextAuthConfig } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Google from 'next-auth/providers/google';
import Nodemailer from 'next-auth/providers/nodemailer';
import { createTransport } from 'nodemailer';
import { prisma } from '@/lib/prisma';
import { env, googleEnabled, emailEnabled } from '@/lib/env';

// There is deliberately no Credentials provider here. Auth.js only supports
// credentials sign-in under the JWT session strategy, and this app uses
// database sessions — registering one made assertConfig reject the whole
// config on every /api/auth request ("UnsupportedStrategy"), so `auth()`
// resolved no session at all under `next dev`. Development sign-in goes
// through /api/auth/test-login, which writes a Session row directly and is
// compatible with the database strategy.

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
