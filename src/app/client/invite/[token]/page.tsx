import { previewAccountInvite } from '@/lib/backend/client-account-actions';
import { requireUser } from '@/lib/supabase/server';
import { AccountInvite, ClientUnavailable } from '@/components/client-account/accounts';
export default async function ClientInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params,
    result = await previewAccountInvite(token);
  return result.ok ? (
    <AccountInvite initial={result.data} token={token} email={(await requireUser()).email ?? ''} />
  ) : (
    <ClientUnavailable title="Invitation unavailable" message={result.error} />
  );
}
