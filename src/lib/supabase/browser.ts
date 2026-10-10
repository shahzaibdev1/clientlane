'use client';
import { createBrowserClient } from '@supabase/ssr';
import { authCookieOptions } from '../auth/cookies';
export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookieOptions: authCookieOptions(process.env.NEXT_PUBLIC_APP_URL) },
  );
}
