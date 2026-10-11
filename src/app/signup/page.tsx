import type { Metadata } from 'next';
import { AuthForm } from '@/components/workspace/auth';
export const metadata: Metadata = {
  title: 'Create account',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; entry?: string }>;
}) {
  const q = await searchParams;
  const entry = q.entry === 'studio' || q.entry === 'client' ? q.entry : undefined;
  return <AuthForm mode="signup" next={q.next} entry={entry} />;
}
