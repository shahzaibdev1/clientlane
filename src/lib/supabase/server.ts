import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { Backend } from '../backend/service';
import { authCookieOptions } from '../auth/cookies';
export async function createServerSupabase() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: authCookieOptions(process.env.NEXT_PUBLIC_APP_URL),
      cookies: {
        getAll() {
          return jar.getAll();
        },
        setAll(values) {
          try {
            values.forEach(({ name, value, options }) => jar.set(name, value, options));
          } catch {
            /* Server components read only; proxy refreshes cookies. */
          }
        },
      },
    },
  );
}
export function createAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export function createBackend() {
  return new Backend(createAdminSupabase());
}
export async function requireUser() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Sign in to continue.');
  return data.user;
}
