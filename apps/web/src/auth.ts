import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Google from 'next-auth/providers/google';
import Nodemailer from 'next-auth/providers/nodemailer';
import Credentials from 'next-auth/providers/credentials';
import { createTransport } from 'nodemailer';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

const credentialsSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  adapter: PrismaAdapter(prisma) as any,
  session: { strategy: 'database', maxAge: 30 * 24 * 60 * 60 },
  pages: {
    signIn: '/login',
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID ?? '',
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? '',
      allowDangerousEmailAccountLinking: true,
    }),
    ...(process.env.EMAIL_SERVER && process.env.EMAIL_FROM
      ? [
          Nodemailer({
            server: process.env.EMAIL_SERVER,
            from: process.env.EMAIL_FROM,
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
          }),
        ]
      : []),
    ...(process.env.NODE_ENV === 'development'
      ? [
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
              return { id: user.id, email: user.email, name: user.name, image: user.image };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user && user) {
        (session.user as any).id = user.id;
      }
      return session;
    },
  },
});
