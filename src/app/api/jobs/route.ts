import { NextResponse, type NextRequest } from 'next/server';
import { createBackend } from '@/lib/supabase/server';
import { Mail } from '@/lib/backend/mail';
import { secretMatches } from '@/lib/backend/crypto';
export async function POST(request: NextRequest) {
  if (!secretMatches(request.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''))
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const mail = new Mail(createBackend());
    const scheduled = await mail.schedule(),
      run = await mail.run();
    return NextResponse.json(
      { ok: true, data: { ...scheduled, ...run } },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Email processing failed. Check mail setup and retry.' },
      { status: 500 },
    );
  }
}
