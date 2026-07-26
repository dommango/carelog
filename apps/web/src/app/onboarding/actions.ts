'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { createPatient } from '@/lib/services/patients';
import { createPatientSchema } from '@/lib/zod';
import { ForbiddenError } from '@/lib/errors';

export type PatientFormState = { error: string | null };

export async function createPatientAction(
  _prevState: PatientFormState,
  formData: FormData
): Promise<PatientFormState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const parsed = createPatientSchema.safeParse({
    name: formData.get('name'),
    dateOfBirth: (formData.get('dateOfBirth') as string) || undefined,
    medicalNotes: (formData.get('medicalNotes') as string) || undefined,
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? 'Please check the details and try again.',
    };
  }

  try {
    await createPatient(session.user.id as string, parsed.data);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { error: error.message };
    }
    console.error('Failed to create patient profile:', error);
    return { error: 'Could not create the profile. Please try again.' };
  }

  revalidatePath('/', 'layout');
  redirect('/');
}
