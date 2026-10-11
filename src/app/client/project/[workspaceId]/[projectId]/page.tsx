import { loadClientProject } from '@/lib/backend/client-account-actions';
import { ClientUnavailable } from '@/components/client-account/accounts';
import { Portal } from '@/components/workspace/portal';
export default async function ClientProjectPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params,
    result = await loadClientProject(workspaceId, projectId);
  return result.ok ? (
    <Portal initial={result.data} account={{ workspaceId, projectId }} />
  ) : (
    <ClientUnavailable title="Client project unavailable" message={result.error} />
  );
}
