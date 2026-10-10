import { loadWorkspace } from '@/lib/backend/actions';
import { Workspace } from '@/components/workspace/workspace';
import { WorkspaceUnavailable } from '@/components/workspace/portal';
export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const query = await searchParams;
  const result = await loadWorkspace(query.workspace);
  return result.ok ? (
    <Workspace initial={result.data} />
  ) : (
    <WorkspaceUnavailable message={result.error} />
  );
}
