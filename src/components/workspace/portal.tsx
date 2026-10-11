'use client';
import { useEffect, useRef, useState } from 'react';
import { Layers } from 'lucide-react';
import { loadPortal, mutatePortal, type Result } from '@/lib/backend/actions';
import type { Command } from '@/lib/domain';
import { ProjectBoard } from './project';
import { Button, FormDialog, type FormSpec } from './forms';
import './workspace.css';
import { loadClientProject, mutateClientProject } from '@/lib/backend/client-account-actions';
import type { ClientProjectView } from '@/lib/backend/client-accounts';
import { AccountHeader } from '../client-account/accounts';
type PortalData = Extract<Awaited<ReturnType<typeof loadPortal>>, { ok: true }>['data'];
export function Portal({
  initial,
  token,
  account,
}: {
  initial: PortalData | ClientProjectView;
  token?: string;
  account?: { workspaceId: string; projectId: string };
}) {
  const [view, setView] = useState(initial),
    [modal, setModal] = useState<FormSpec | null>(null),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [busy, setBusy] = useState(false);
  const openForm = (spec: FormSpec) => setModal(spec);
  const context = account
    ? { ...account, clientAccount: true }
    : { token, projectId: view.project.id };
  const reload = () =>
    account ? loadClientProject(account.workspaceId, account.projectId) : loadPortal(token!);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  async function command(c: Command) {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await (account
        ? mutateClientProject(account.workspaceId, account.projectId, {
            version: viewRef.current.version,
            command: c,
          })
        : mutatePortal(token!, { version: viewRef.current.version, command: c }));
      if (!result.ok) {
        if (/reload|version|changed/i.test(result.error)) {
          const latest = await reload();
          if (latest.ok) setView(latest.data);
        }
        throw new Error(result.error);
      }
      setView(result.data);
      setSuccess('Saved. Your studio has the latest update.');
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unable to save. Try again.';
      setError(message);
      throw new Error(message, { cause: e });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ws-portal">
      {account && <AccountHeader />}
      <header className="ws-portal-header">
        <div className="ws-portal-brand">
          {view.settings.logoUrl ? (
            <img
              src={view.settings.logoUrl}
              alt={`${view.settings.brandName} logo`}
              referrerPolicy="no-referrer"
            />
          ) : (
            <Layers size={25} style={{ color: view.settings.brandColor }} />
          )}
          {view.settings.brandName}
        </div>
        <span>Your client project space</span>
      </header>
      <main id="main" aria-busy={busy}>
        {success && (
          <p role="status" className="ws-success">
            {success}
          </p>
        )}
        {error && (
          <div className="ws-error" role="alert">
            <p>{error}</p>
            <Button
              secondary
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await reload();
                  if (result.ok) {
                    setView(result.data);
                    setError('');
                    setSuccess('Latest project loaded. Your form values are still here.');
                  } else setError(result.error);
                } catch {
                  setError('Unable to reload the project. Check your connection and try again.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Reload latest
            </Button>
          </div>
        )}
        <ProjectBoard
          project={view.project}
          client
          currency={view.settings.currency}
          context={context}
          onCommand={command}
          openForm={openForm}
        />
        {'expiresAt' in view && (
          <p className="ws-muted">
            Access expires{' '}
            {new Date(view.expiresAt).toLocaleDateString('en-US', { timeZone: 'UTC' })}. Keep this
            private link for your project.
          </p>
        )}
      </main>
      {modal && <FormDialog spec={modal} onClose={() => setModal(null)} context={context} />}
    </div>
  );
}
export function WorkspaceUnavailable({
  title = 'Workspace unavailable',
  message,
}: {
  title?: string;
  message: string;
}) {
  return (
    <div className="ws-portal">
      <main id="main" className="ws-portal-unavailable">
        <Layers size={35} />
        <p className="ws-eyebrow">LET’S GET YOU BACK ON TRACK</p>
        <h1>{title}</h1>
        <p>{message}</p>
        <a className="ws-button" href="/login">
          Sign in to your workspace
        </a>
      </main>
    </div>
  );
}
export function Invitation({ token, email }: { token: string; email: string }) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function accept() {
    setBusy(true);
    setError('');
    try {
      const { acceptMemberInvite } = await import('@/lib/backend/actions');
      const result: Result<{ workspaceId: string }> = await acceptMemberInvite(token);
      if (!result.ok) throw new Error(result.error);
      location.assign(`/app?workspace=${encodeURIComponent(result.data.workspaceId)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to accept invitation.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ws-auth">
      <main id="main" className="ws-portal-unavailable">
        <Layers size={36} />
        <p className="ws-eyebrow">GOOD WORK, TOGETHER</p>
        <h1>Join this project team.</h1>
        <p>
          You’re signed in as <strong>{email}</strong>. Accept this invitation if this is the email
          your studio invited.
        </p>
        <p className="ws-muted">
          Your email must be confirmed. You’ll receive access only to the projects selected by the
          studio.
        </p>
        {error && (
          <p className="ws-error" role="alert">
            {error}
          </p>
        )}
        <Button onClick={() => void accept()} disabled={busy}>
          {busy ? 'Joining…' : 'Accept invitation'}
        </Button>
        <p className="ws-muted">
          <a href="/app">Back to your workspace</a>
        </p>
      </main>
    </div>
  );
}
