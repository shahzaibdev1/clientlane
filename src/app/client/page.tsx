import { loadClientDashboard } from '@/lib/backend/client-account-actions';
import { ClientDashboard, ClientUnavailable } from '@/components/client-account/accounts';
export default async function ClientPage() {
  const result = await loadClientDashboard();
  return result.ok ? (
    <ClientDashboard initial={result.data} />
  ) : (
    <ClientUnavailable title="Client dashboard unavailable" message={result.error} />
  );
}
