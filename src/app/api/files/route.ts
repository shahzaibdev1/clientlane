import { NextResponse, type NextRequest } from 'next/server';
import { createBackend, requireUser } from '@/lib/supabase/server';
import { Files, readUpload } from '@/lib/backend/files';
const headers = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};
export async function POST(request: NextRequest) {
  try {
    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > 21 * 1024 * 1024) throw new Error('Files must be no larger than 20MB.');
    const body = await readUpload(request),
      file = body.get('file'),
      projectId = body.get('projectId'),
      token = body.get('token'),
      workspaceId = body.get('workspaceId');
    if (
      !(file instanceof File) ||
      typeof projectId !== 'string' ||
      (token !== null && typeof token !== 'string') ||
      (workspaceId !== null && typeof workspaceId !== 'string')
    )
      throw new Error('Choose a file and project.');
    const actor = token
      ? { token }
      : { userId: (await requireUser()).id, workspaceId: workspaceId ?? undefined };
    const ref = await new Files(createBackend()).upload(actor, projectId, file);
    return NextResponse.json({ ok: true, data: ref }, { headers });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Upload failed.' },
      { status: 400, headers },
    );
  }
}
export async function GET(request: NextRequest) {
  try {
    const path = request.nextUrl.searchParams.get('path'),
      token = request.nextUrl.searchParams.get('token');
    if (!path) throw new Error('Choose a file.');
    const actor = token ? { token } : { userId: (await requireUser()).id };
    const service = new Files(createBackend()),
      metadata = await service.metadata(actor, path),
      blob = await service.download(actor, path);
    return new Response(blob, {
      headers: {
        ...headers,
        'Content-Type': metadata.type,
        'Content-Length': String(metadata.size),
        'Content-Disposition': `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(metadata.name)}`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'File could not be downloaded.',
      },
      { status: 403, headers },
    );
  }
}
