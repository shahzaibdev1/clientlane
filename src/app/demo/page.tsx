import type { Metadata } from 'next';
import { Workspace } from '@/components/workspace/workspace';
export const metadata: Metadata = {
  title: 'Interactive demo',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export const dynamic = 'force-dynamic';
export default function DemoPage() {
  return <Workspace demo />;
}
