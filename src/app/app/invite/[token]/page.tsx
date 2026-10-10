import { requireUser } from '@/lib/supabase/server';
import { Invitation } from '@/components/workspace/portal';
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await requireUser();
  return <Invitation token={token} email={user.email ?? ''} />;
}
