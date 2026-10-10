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
  searchParams: Promise<{ next?: string }>;
}) {
  const q = await searchParams;
  return <AuthForm mode="signup" next={q.next} />;
}
