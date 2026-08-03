import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { getActor } from '@/lib/policy';
import { reportQuerySchema } from '@/lib/zod';
import { getDoctorVisitExport, exportToCsv } from '@/lib/services/reports';
import { ForbiddenError } from '@/lib/errors';
import { renderToBuffer } from '@react-pdf/renderer';
import * as React from 'react';
import DoctorVisitReport from '@/components/DoctorVisitReport';

// The patient name is user-controlled and lands inside a quoted
// Content-Disposition filename. CR/LF would let it inject additional response
// headers, and a bare quote would end the filename early. Strip both, collapse
// anything else awkward in a filename, and bound the length.
function safeFilenamePart(name: string): string {
  const cleaned = name
    .replace(/[\r\n]/g, '')
    .replace(/[\\"]/g, '')
    .replace(/[^\p{L}\p{N} _-]/gu, '-')
    .trim()
    .slice(0, 60);
  return cleaned || 'patient';
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const actor = await getActor(session.user.id as string);
  if (!actor) {
    return new Response('Forbidden', { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = reportQuerySchema.safeParse({
    patientId: searchParams.get('patientId') ?? undefined,
    start: searchParams.get('start'),
    end: searchParams.get('end'),
  });

  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const format = searchParams.get('format') ?? 'csv';

  try {
    const data = await getDoctorVisitExport(actor, parsed.data);
    const filenameBase = `carelog-report-${safeFilenamePart(data.patient.name)}`;

    if (format === 'pdf') {
      const buffer = await renderToBuffer(
        React.createElement(DoctorVisitReport, { data }) as unknown as Parameters<typeof renderToBuffer>[0]
      );
      return new Response(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filenameBase}.pdf"`,
        },
      });
    }

    const csv = exportToCsv(data);
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filenameBase}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
}
