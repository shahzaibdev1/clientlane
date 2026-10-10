import type { Metadata } from 'next';
import { AuthForm } from '@/components/workspace/auth';
export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const q = await searchParams;
  return <AuthForm mode="login" next={q.next} callbackError={Boolean(q.error)} />;
}
