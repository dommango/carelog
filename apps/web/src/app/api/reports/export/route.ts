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
// Content-Disposition filename. A bare quote ends the filename early and lets
// extra parameters be injected (`filename="a"; x=y.csv"` is accepted verbatim).
// CR/LF is not exploitable here — Node's Headers rejects it outright — but that
// means an unsanitised name would throw and 500 the export instead.
//
// ASCII-only, deliberately: header values are ByteStrings, so a single
// non-Latin-1 character (a Chinese or accented name) throws
// "Cannot convert argument to a ByteString" and breaks the download entirely.
// The unencoded `filename` is the ASCII fallback; `filename*` below carries the
// real name per RFC 5987.
function asciiFilenamePart(name: string): string {
  const cleaned = name
    .replace(/[^A-Za-z0-9 _-]/g, '-')
    .replace(/-{2,}/g, '-')
    .trim()
    .slice(0, 60);
  return cleaned || 'patient';
}

/** `filename` for any client, `filename*` for those that understand UTF-8. */
function contentDisposition(name: string, extension: string): string {
  const ascii = `carelog-report-${asciiFilenamePart(name)}.${extension}`;
  const utf8 = encodeURIComponent(`carelog-report-${name}.${extension}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
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

    if (format === 'pdf') {
      const buffer = await renderToBuffer(
        React.createElement(DoctorVisitReport, { data }) as unknown as Parameters<typeof renderToBuffer>[0]
      );
      return new Response(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': contentDisposition(data.patient.name, 'pdf'),
        },
      });
    }

    const csv = exportToCsv(data);
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': contentDisposition(data.patient.name, 'csv'),
      },
    });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
}
