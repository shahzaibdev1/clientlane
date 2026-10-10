import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { safeNext } from '@/lib/auth/redirect';
import type { EmailOtpType } from '@supabase/supabase-js';
export async function GET(request: NextRequest) {
  const url = request.nextUrl,
    code = url.searchParams.get('code'),
    tokenHash = url.searchParams.get('token_hash'),
    type = url.searchParams.get('type');
  const supabase = await createServerSupabase();
  const result = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && ['signup', 'email', 'recovery', 'invite', 'email_change'].includes(type ?? '')
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType })
      : { error: new Error('Invalid link') };
  const target = result.error
    ? '/login?error=Your%20sign-in%20link%20expired.%20Please%20request%20a%20new%20one.'
    : safeNext(url.searchParams.get('next') ?? (type === 'recovery' ? '/reset' : '/app'));
  const response = NextResponse.redirect(
    new URL(target, process.env.NEXT_PUBLIC_APP_URL ?? url.origin),
  );
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
