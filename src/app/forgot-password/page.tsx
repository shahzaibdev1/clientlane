import type { Metadata } from 'next';
import { AuthForm } from '@/components/workspace/auth';
export const metadata: Metadata = {
  title: 'Password recovery',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default function ForgotPage() {
  return <AuthForm mode="forgot" />;
}
