import type { Metadata } from 'next';
import { AuthForm } from '@/components/workspace/auth';
export const metadata: Metadata = {
  title: 'Reset password',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default function ResetPage() {
  return <AuthForm mode="reset" />;
}
