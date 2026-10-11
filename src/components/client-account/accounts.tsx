'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Layers } from 'lucide-react';
import { Button, FormDialog, type FormSpec } from '../workspace/forms';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import * as api from '@/lib/backend/client-account-actions';
import type { AccountInvitation, ClientProjectSummary } from '@/lib/backend/client-accounts';
import type { Result } from '@/lib/backend/actions';
import '../workspace/workspace.css';
import './accounts.css';
type Preview = { id: string; url: string; expiresAt: string };
function InviteLink({ invitation }: { invitation: Preview }) {
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <section className="ws-card">
      <h2>Your account invitation</h2>
      <p className="ws-muted">
        Expires {new Date(invitation.expiresAt).toLocaleString()}. Only the confirmed invited email
        can accept.
      </p>
      <label className="ws-field">
        <span>Account invitation URL</span>
        <input readOnly value={invitation.url} />
      </label>
      <div className="ws-actions">
        <Button
          secondary
          onClick={() => {
            void navigator.clipboard
              .writeText(invitation.url)
              .then(() => setMessage('Invitation copied.'))
              .catch(() => setMessage('Select and copy the invitation URL above.'));
          }}
        >
          Copy invitation
        </Button>
        <Button
          secondary
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await api.sendAccountInvite(invitation.id);
              setMessage(
                r.ok
                  ? r.data.status === 'sent'
                    ? 'Invitation accepted by the email server.'
                    : `Email ${r.data.status}. ${r.data.error ?? ''}`
                  : r.error,
              );
            } catch {
              setMessage('Unable to send. Try again.');
            } finally {
              setBusy(false);
            }
          }}
        >
          Send invitation email
        </Button>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
export function AccountHeader() {
  const [error, setError] = useState('');
  return (
    <header className="ca-header">
      <Link className="ws-auth-brand" href="/client">
        <Layers size={24} />
        Clientlane
      </Link>
      <nav aria-label="Account navigation">
        <Link href="/client">My client projects</Link>
        <Link href="/app">Studio workspace</Link>
        <Button
          secondary
          onClick={async () => {
            const r = await createBrowserSupabase().auth.signOut();
            if (r.error) setError('Unable to sign out. Try again.');
            else location.assign('/login?next=/client');
          }}
        >
          Sign out
        </Button>
      </nav>
      {error && <p role="alert">{error}</p>}
    </header>
  );
}
function InvitationRows({
  invitations,
  onRevoke,
}: {
  invitations: AccountInvitation[];
  onRevoke: (id: string) => void;
}) {
  return (
    <div className="ws-stack">
      {invitations.map((i) => (
        <article className="ws-card" key={i.id}>
          <div className="ws-card-heading">
            <div>
              <h3>{i.title}</h3>
              <p className="ca-email">{i.email}</p>
            </div>
            <span className="ws-badge">{i.status}</span>
          </div>
          {i.status === 'pending' && (
            <Button secondary onClick={() => onRevoke(i.id)}>
              Revoke invitation
            </Button>
          )}
        </article>
      ))}
    </div>
  );
}
export function ClientDashboard({
  initial,
}: {
  initial: { projects: ClientProjectSummary[]; invitations: AccountInvitation[] };
}) {
  const [view, setView] = useState(initial),
    [modal, setModal] = useState<FormSpec | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function refresh() {
    const r = await api.loadClientDashboard();
    if (!r.ok) throw new Error(r.error);
    setView(r.data);
  }
  async function revoke(id: string) {
    setBusy(true);
    setError('');
    try {
      const r = await api.revokeAccountInvite(id);
      if (!r.ok) throw new Error(r.error);
      await refresh();
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to revoke invitation.');
    } finally {
      setBusy(false);
    }
  }
  function brief() {
    setModal({
      title: 'Invite your provider',
      submit: 'Create invitation',
      description:
        'Bring a freelancer or agency you already work with. They must sign in with the invited email and accept. Your brief becomes a project in their studio; client accounts are free.',
      fields: [
        { name: 'providerEmail', label: 'Provider email', type: 'email', required: true },
        { name: 'clientName', label: 'Your name', required: true },
        { name: 'title', label: 'Project title', required: true },
        { name: 'description', label: 'Project brief', type: 'textarea', required: true },
        { name: 'dueDate', label: 'Target date', type: 'date' },
      ],
      onSubmit: async (values) => {
        const r = await api.inviteProviderAccount({
          providerEmail: values.providerEmail,
          clientName: values.clientName,
          title: values.title,
          description: values.description,
          dueDate: values.dueDate || null,
        });
        if (!r.ok) throw new Error(r.error);
        setPreview(r.data);
        await refresh();
        return true;
      },
    });
  }
  return (
    <div className="ws-portal ca-page">
      <AccountHeader />
      <main id="main" className="ca-main" aria-busy={busy}>
        <p className="ws-eyebrow">YOUR PROVIDERS, ONE CLEAR PLACE</p>
        <h1>Your client projects.</h1>
        <p className="ws-muted">
          Accepted projects across your freelancers and agencies. Client accounts are free.
        </p>
        <div className="ws-actions">
          <Button onClick={brief}>Invite your provider</Button>
          <Button
            secondary
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await refresh();
                setError('');
              } catch {
                setError('Unable to refresh. Check your connection and try again.');
              } finally {
                setBusy(false);
              }
            }}
          >
            Refresh projects
          </Button>
        </div>
        {error && (
          <p className="ws-error" role="alert">
            {error}
          </p>
        )}
        {preview && <InviteLink invitation={preview} />}
        <section aria-label="Accepted client projects" className="ws-stack">
          {view.projects.length ? (
            view.projects.map((p) => (
              <article className="ws-card" key={`${p.workspaceId}/${p.projectId}`}>
                <p className="ws-eyebrow">{p.studio}</p>
                <h2>{p.title}</h2>
                <p>
                  {p.archived
                    ? 'Archived · read only'
                    : p.status === 'completed'
                      ? 'Completed'
                      : `${p.nextActions} next ${p.nextActions === 1 ? 'action' : 'actions'}`}
                  {p.dueDate && ` · Target ${p.dueDate}`}
                </p>
                <Link
                  className="ws-button secondary"
                  href={`/client/project/${p.workspaceId}/${p.projectId}`}
                >
                  Open {p.title}
                </Link>
              </article>
            ))
          ) : (
            <article className="ws-card">
              <h2>No accepted projects yet.</h2>
              <p>
                Accept a project invitation from your provider, or send them a brief above. A
                pending invitation does not grant access.
              </p>
            </article>
          )}
        </section>
        {view.invitations.length > 0 && (
          <section>
            <h2>Invitations you sent</h2>
            <InvitationRows invitations={view.invitations} onRevoke={(id) => void revoke(id)} />
          </section>
        )}
      </main>
      {modal && <FormDialog spec={modal} onClose={() => setModal(null)} />}
    </div>
  );
}
export function ProjectAccountControls({
  workspaceId,
  projectId,
}: {
  workspaceId: string;
  projectId: string;
}) {
  const [invitations, setInvitations] = useState<AccountInvitation[]>([]),
    [preview, setPreview] = useState<Preview | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState<FormSpec | null>(null);
  useEffect(() => {
    let active = true;
    api
      .listProjectAccountInvites(workspaceId, projectId)
      .then((r) => {
        if (active) {
          if (r.ok) setInvitations(r.data);
          else setError(r.error);
        }
      })
      .catch(() => {
        if (active) setError('Unable to load account invitations.');
      });
    return () => {
      active = false;
    };
  }, [workspaceId, projectId]);
  async function run<T>(fn: () => Promise<Result<T>>) {
    setBusy(true);
    setError('');
    try {
      const r = await fn();
      if (!r.ok) throw new Error(r.error);
      const latest = await api.listProjectAccountInvites(workspaceId, projectId);
      if (!latest.ok) throw new Error(latest.error);
      setInvitations(latest.data);
      return r.data;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unable to continue.';
      setError(message);
      throw new Error(message, { cause: e });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ws-card">
      <h2>Client account access</h2>
      <p className="ws-muted">
        Invite this project’s client email. Accepted account access and private client links can be
        revoked independently.
      </p>
      <div className="ws-actions">
        <Button
          secondary
          disabled={busy}
          onClick={() => {
            void run(() => api.inviteClientAccount(workspaceId, projectId))
              .then(setPreview)
              .catch(() => {});
          }}
        >
          Invite client account
        </Button>
        <Button
          secondary
          disabled={busy}
          onClick={() =>
            setModal({
              title: 'Revoke account access?',
              submit: 'Confirm revocation',
              description:
                'This removes accepted client account access and every earlier account invitation for this project. Private client links remain available until separately revoked.',
              onSubmit: async () => {
                await run(() => api.revokeClientAccount(workspaceId, projectId));
                setPreview(null);
                return true;
              },
            })
          }
        >
          Revoke account access
        </Button>
      </div>
      {error && (
        <p className="ws-error" role="alert">
          {error}
        </p>
      )}
      {preview && <InviteLink invitation={preview} />}
      <InvitationRows
        invitations={invitations}
        onRevoke={(id) => {
          void run(() => api.revokeAccountInvite(id))
            .then(() => setPreview(null))
            .catch(() => {});
        }}
      />
      {modal && <FormDialog spec={modal} onClose={() => setModal(null)} />}
    </section>
  );
}
export function AccountInvite({
  initial,
  token,
  email,
}: {
  initial: AccountInvitation;
  token: string;
  email: string;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(initial.status);
  async function act(accept: boolean) {
    setBusy(true);
    setError('');
    try {
      if (accept) {
        const r = await api.acceptAccountInvite(token);
        if (!r.ok) throw new Error(r.error);
        location.assign(
          r.data.direction === 'client'
            ? `/client/project/${r.data.workspaceId}/${r.data.projectId}`
            : `/app?workspace=${encodeURIComponent(r.data.workspaceId)}`,
        );
      } else {
        const r = await api.declineAccountInvite(token);
        if (!r.ok) throw new Error(r.error);
        setStatus('declined');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to continue.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ws-portal ca-page">
      <AccountHeader />
      <main id="main" className="ca-main">
        <p className="ws-eyebrow">GOOD WORK, TOGETHER</p>
        <h1>
          {initial.direction === 'client'
            ? 'Accept your project invitation.'
            : 'A client invited you to a project.'}
        </h1>
        <p>
          Signed in as <strong className="ca-email">{email}</strong>.
        </p>
        <article className="ws-card">
          <h2>{initial.title}</h2>
          <p className="ca-brief">{initial.description}</p>
          {initial.dueDate && <p>Target date: {initial.dueDate}</p>}
          <p className="ws-muted">
            {initial.direction === 'client'
              ? 'Accept to add only this project to your client dashboard.'
              : 'Accept to create this project and its client in your studio and give the originating client access to their project.'}{' '}
            Expires {new Date(initial.expiresAt).toLocaleString()}.
          </p>
          <p>Status: {status}</p>
          {error && (
            <p className="ws-error" role="alert">
              {error}
            </p>
          )}
          {(status === 'pending' || status === 'accepted') && (
            <div className="ws-actions">
              <Button disabled={busy} onClick={() => void act(true)}>
                {busy ? 'Please wait…' : 'Accept invitation'}
              </Button>
              {status === 'pending' && (
                <Button secondary disabled={busy} onClick={() => void act(false)}>
                  Decline invitation
                </Button>
              )}
            </div>
          )}
        </article>
        <Link href="/client">Back to client projects</Link>
      </main>
    </div>
  );
}
export function ClientUnavailable({ title, message }: { title: string; message: string }) {
  return (
    <div className="ws-portal ca-page">
      <AccountHeader />
      <main id="main" className="ca-main">
        <h1>{title}</h1>
        <p role="alert" className="ws-error">
          {message}
        </p>
        <p>If you were invited at another email, sign out and use that confirmed account.</p>
        <Link href="/client" className="ws-button">
          Back to client projects
        </Link>
      </main>
    </div>
  );
}
