import type { Metadata } from 'next';
import { loadPortal } from '@/lib/backend/actions';
import { Portal, WorkspaceUnavailable } from '@/components/workspace/portal';
export const metadata: Metadata = {
  title: 'Your client project',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export const dynamic = 'force-dynamic';
export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await loadPortal(token);
  return result.ok ? (
    <Portal initial={result.data} token={token} />
  ) : (
    <WorkspaceUnavailable
      title="This link is unavailable"
      message="The link may have expired or been replaced. Ask your studio for a fresh project link."
    />
  );
}
