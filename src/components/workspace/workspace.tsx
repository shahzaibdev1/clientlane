'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import {
  Layers,
  Sun,
  FolderOpen,
  Users,
  LayoutTemplate,
  Settings,
  ArrowUpRight,
  Plus,
  Search,
  Download,
  RotateCcw,
  LogOut,
  Menu,
  X,
  Clock3,
  CheckCircle2,
} from 'lucide-react';
import {
  applyCommand,
  sampleState,
  workspaceSchema,
  dashboard,
  commandSchema,
  exportProjectsCsv,
  exportWorkspaceJson,
  parseProjectsCsv,
  BUILTIN_TEMPLATES,
  type Command,
  type Project,
  type Client,
  type ProjectTemplate,
  type CsvPreview,
  type DashboardItem,
} from '@/lib/domain';
import type { WorkspaceView } from '@/lib/backend/service';
import * as api from '@/lib/backend/actions';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { Button, FormDialog, uid, dateValue, download, type FormSpec, type Field } from './forms';
import { ProjectBoard, Empty, displayDate } from './project';
import './workspace.css';
const DEMO_KEY = 'clientlane-demo-v1';
const envelope = z.strictObject({
  state: workspaceSchema,
  version: z.number().int().nonnegative(),
});
type TeamData = Extract<Awaited<ReturnType<typeof api.listMembers>>, { ok: true }>['data'];
type Emails = Extract<Awaited<ReturnType<typeof api.listEmailQueue>>, { ok: true }>['data'];
const today = () => new Date().toISOString().slice(0, 10);
function demoView(state = sampleState('demo', today()), version = 0): WorkspaceView {
  return {
    state,
    version,
    role: 'owner',
    userId: 'demo-owner',
    userEmail: 'hello@northline.example.test',
    projectIds: state.projects.map((p) => p.id),
    workspaces: [{ id: 'demo', name: state.settings.brandName, role: 'owner' }],
  };
}
export function Workspace({ initial, demo = false }: { initial?: WorkspaceView; demo?: boolean }) {
  const [view, setView] = useState(initial ?? demoView()),
    [page, setPage] = useState('Today'),
    [selected, setSelected] = useState<string | null>(null),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all'),
    [modal, setModal] = useState<FormSpec | null>(null),
    [csv, setCsv] = useState(false),
    [preview, setPreview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [corrupt, setCorrupt] = useState(false),
    [ready, setReady] = useState(!demo),
    [mobile, setMobile] = useState(false),
    [team, setTeam] = useState<TeamData | null>(null),
    [emails, setEmails] = useState<Emails>([]),
    [portalLink, setPortalLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const errorRef = useRef('');
  const navigationTrigger = useRef<HTMLButtonElement>(null);
  const navigationClose = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (mobile) navigationClose.current?.focus();
  }, [mobile]);
  function closeNavigation() {
    setMobile(false);
    navigationTrigger.current?.focus();
  }
  const live = useRef({ view, busy, corrupt, preview, selected });
  useEffect(() => {
    live.current = { view, busy, corrupt, preview, selected };
  }, [view, busy, corrupt, preview, selected]);
  const state = view.state,
    owner = view.role === 'owner',
    project = state.projects.find((p) => p.id === selected);
  const setFailure = (message: string) => {
    errorRef.current = message;
    setError(message);
    setSuccess('');
  };
  useEffect(() => {
    if (!demo) return;
    try {
      const raw = localStorage.getItem(DEMO_KEY);
      if (raw) {
        const stored = envelope.parse(JSON.parse(raw));
        setView(demoView(stored.state, stored.version));
      } else {
        const fresh = demoView();
        localStorage.setItem(DEMO_KEY, JSON.stringify({ state: fresh.state, version: 0 }));
        setView(fresh);
      }
      setReady(true);
    } catch {
      setCorrupt(true);
      setReady(true);
      setFailure('Your saved demo could not be read. Reset it to load a fresh sample.');
    }
    const changed = () =>
      setFailure(
        'The demo changed in another tab. Reload the latest demo before saving your next change.',
      );
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [demo]);
  useEffect(() => {
    if (demo || !owner) {
      setTeam(null);
      setEmails([]);
      return;
    }
    setTeam(null);
    let active = true;
    Promise.all([api.listMembers(state.workspaceId), api.listEmailQueue(state.workspaceId)])
      .then(([members, mail]) => {
        if (!active) return;
        if (members.ok) setTeam(members.data);
        else setFailure(members.error);
        if (mail.ok) setEmails(mail.data);
        else setFailure(mail.error);
      })
      .catch(() => {
        if (active)
          setFailure(
            'Unable to load team and email activity. Check your connection and reload the latest workspace.',
          );
      });
    return () => {
      active = false;
    };
  }, [demo, owner, state.workspaceId]);
  async function refresh(id = state.workspaceId) {
    setBusy(true);
    try {
      if (demo) {
        const raw = localStorage.getItem(DEMO_KEY);
        const latest = envelope.parse(JSON.parse(raw ?? 'null'));
        setView(demoView(latest.state, latest.version));
        setCorrupt(false);
      } else {
        const result = await api.loadWorkspace(id);
        if (!result.ok) throw new Error(result.error);
        setView(result.data);
      }
      setError('');
      setSuccess('Latest workspace loaded. Your form values are still here.');
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'Unable to reload.');
    } finally {
      setBusy(false);
    }
  }
  async function command(cmd: Command): Promise<boolean> {
    const current = live.current;
    const currentState = current.view.state;
    const currentProject = currentState.projects.find((p) => p.id === current.selected);
    if (current.busy || current.corrupt) {
      setFailure('Wait for the current update, or reset the unreadable demo.');
      return false;
    }
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      if (demo) {
        const latest = envelope.parse(JSON.parse(localStorage.getItem(DEMO_KEY) ?? 'null'));
        if (latest.version !== current.view.version) {
          setView(demoView(latest.state, latest.version));
          throw new Error(
            'The demo changed in another tab. Latest changes are loaded; review your form and save again.',
          );
        }
        const client = currentState.clients.find((c) => c.id === currentProject?.clientId);
        const actor =
          current.preview && currentProject
            ? {
                role: 'client' as const,
                projectId: currentProject.id,
                name: client?.name ?? 'Demo client',
              }
            : { role: 'owner' as const, id: 'demo-owner' };
        const next = applyCommand(currentState, cmd, actor, new Date());
        const nextView = demoView(next, current.view.version + 1);
        localStorage.setItem(DEMO_KEY, JSON.stringify({ state: next, version: nextView.version }));
        setView(nextView);
      } else {
        const result = await api.mutateWorkspace({
          workspaceId: currentState.workspaceId,
          version: current.view.version,
          command: cmd,
        });
        if (!result.ok) {
          if (/reload|version|changed/i.test(result.error)) {
            const reloaded = await api.loadWorkspace(currentState.workspaceId);
            if (reloaded.ok) setView(reloaded.data);
          }
          throw new Error(result.error);
        }
        setView(result.data);
      }
      setSuccess('Saved. Everyone can see the latest project progress.');
      return true;
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'Unable to save. Try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }
  function openForm(spec: FormSpec) {
    setModal({
      ...spec,
      onSubmit: async (v, f) => {
        const ok = await spec.onSubmit(v, f);
        if (!ok) throw new Error(errorRef.current || 'The update could not be saved. Try again.');
        return true;
      },
    });
  }
  const cmdForm = (
    title: string,
    submit: string,
    fields: Field[],
    make: (v: Record<string, string>) => unknown,
  ) =>
    openForm({
      title,
      submit,
      fields,
      onSubmit: async (v) => command(commandSchema.parse(make(v))),
    });
  const confirm = (title: string, description: string, run: () => Promise<boolean>) =>
    openForm({ title, description, submit: 'Confirm', onSubmit: run });
  function navigate(next: string) {
    setPage(next);
    setSelected(null);
    setPreview(false);
    if (mobile) closeNavigation();
    setQuery('');
    setFilter('all');
    setPortalLink(null);
  }
  function clientForm(client?: Client) {
    cmdForm(
      client ? 'Edit client' : 'New client',
      client ? 'Save client' : 'Create client',
      [
        { name: 'name', label: 'Client name', required: true, value: client?.name },
        {
          name: 'email',
          label: 'Client email',
          type: 'email',
          required: true,
          value: client?.email,
        },
        { name: 'company', label: 'Company', value: client?.company },
      ],
      (v) => ({
        type: client ? 'client.update' : 'client.create',
        ...(client ? { clientId: client.id } : { id: uid() }),
        name: v.name,
        email: v.email,
        company: v.company,
      }),
    );
  }
  function projectForm(p?: Project) {
    if (!state.clients.length) {
      clientForm();
      return;
    }
    const assignees =
      team?.members
        .filter((m) => p && !m.revoked_at && m.project_ids.includes(p.id))
        .map((m) => ({ value: m.user_id, label: m.email })) ?? [];
    if (p?.assigneeId && !assignees.some((m) => m.value === p.assigneeId))
      assignees.push({
        value: p.assigneeId,
        label: team
          ? 'Current teammate (no longer available)'
          : 'Current teammate (team unavailable)',
      });
    openForm({
      title: p ? 'Edit project' : 'New project',
      submit: p ? 'Save project' : 'Create project',
      description:
        !p && owner
          ? 'New projects start managed by the studio owner. Create the project first, invite a teammate with access to it, then assign them from Edit project.'
          : undefined,
      fields: [
        { name: 'title', label: 'Project title', required: true, value: p?.title },
        {
          name: 'description',
          label: 'Project description',
          type: 'textarea',
          value: p?.description,
        },
        ...(!p
          ? [
              {
                name: 'clientId',
                label: 'Client',
                type: 'select' as const,
                value: state.clients[0]?.id,
                options: state.clients.map((c) => ({
                  value: c.id,
                  label: `${c.name} · ${c.company || c.email}`,
                })),
              },
            ]
          : []),
        { name: 'dueDate', label: 'Project due date', type: 'date', value: p?.dueDate },
        ...(owner
          ? [
              {
                name: 'revisionAllowance',
                label: 'Included revision rounds',
                type: 'number' as const,
                min: 0,
                max: 1000,
                value: p?.revisionAllowance ?? 2,
              },
              {
                name: 'assigneeId',
                label: 'Assigned teammate',
                type: 'select' as const,
                value: p?.assigneeId ?? '',
                disabled: !!p && !team,
                options: [{ value: '', label: 'Studio owner / unassigned' }, ...assignees],
              },
            ]
          : []),
        ...(p
          ? [
              {
                name: 'status',
                label: 'Project status',
                type: 'select' as const,
                value: p.status,
                options: ['active', 'waiting', 'review', 'completed'].map((value) => ({
                  value,
                  label: value,
                })),
              },
            ]
          : [
              {
                name: 'templateId',
                label: 'Project template',
                type: 'select' as const,
                value: '',
                options: [
                  { value: '', label: 'Start from scratch' },
                  ...state.templates.map((t) => ({ value: t.id, label: t.name })),
                ],
              },
            ]),
      ],
      onSubmit: async (v) => {
        const id = p?.id ?? uid();
        const raw = p
          ? {
              type: 'project.update',
              projectId: id,
              title: v.title,
              description: v.description,
              dueDate: dateValue(v.dueDate),
              status: v.status,
              ...(owner
                ? {
                    revisionAllowance: Number(v.revisionAllowance),
                    ...(v.assigneeId !== undefined && dateValue(v.assigneeId) !== p.assigneeId
                      ? { assigneeId: dateValue(v.assigneeId) }
                      : {}),
                  }
                : {}),
            }
          : {
              type: 'project.create',
              id,
              clientId: v.clientId,
              title: v.title,
              description: v.description,
              dueDate: dateValue(v.dueDate),
              revisionAllowance: v.templateId
                ? (state.templates.find((t) => t.id === v.templateId)?.revisionAllowance ??
                  Number(v.revisionAllowance))
                : Number(v.revisionAllowance),
              ...(v.templateId ? { templateId: v.templateId } : {}),
              assigneeId: null,
            };
        const ok = await command(commandSchema.parse(raw));
        if (ok) {
          setSelected(id);
          setPage('Projects');
        }
        return ok;
      },
    });
  }
  async function external<T>(
    action: () => Promise<api.Result<T>>,
    successMessage: (data: T) => string,
  ): Promise<T | null> {
    setBusy(true);
    setError('');
    try {
      const result = await action();
      if (!result.ok) throw new Error(result.error);
      setSuccess(successMessage(result.data));
      return result.data;
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'Unable to continue.');
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function updateTeam() {
    if (demo) return;
    const result = await api.listMembers(state.workspaceId);
    if (result.ok) setTeam(result.data);
    else setFailure(result.error);
  }
  function share() {
    if (!project) return;
    openForm({
      title: 'Share this project',
      submit: demo ? 'Preview demo invitation' : 'Create / rotate secure link',
      description: demo
        ? 'Demo email preview only. No email is sent and no public client link is created.'
        : `The link gives ${state.clients.find((c) => c.id === project.clientId)?.email} access to this project. Creating a new link revokes every previous link.`,
      fields: demo
        ? []
        : [
            {
              name: 'expiryDays',
              label: 'Link expiry (days)',
              type: 'number',
              min: 1,
              max: 90,
              value: 30,
              required: true,
            },
          ],
      onSubmit: async (v) => {
        if (demo) {
          setSuccess(
            'Demo invitation preview: Your project is ready. Open Client preview to respond and review. No email sent.',
          );
          return true;
        }
        const data = await external(
          () =>
            api.createPortalLink({
              workspaceId: state.workspaceId,
              projectId: project.id,
              expiryDays: Number(v.expiryDays),
            }),
          () => 'Secure client link created.',
        );
        if (data) setPortalLink(data);
        return Boolean(data);
      },
    });
  }
  function saveTemplate(p: Project) {
    cmdForm(
      'Save project as template',
      'Save template',
      [
        { name: 'name', label: 'Template name', required: true, value: `${p.title} template` },
        {
          name: 'description',
          label: 'Template description',
          type: 'textarea',
          value: p.description,
        },
      ],
      (v) => ({
        type: 'template.save',
        id: uid(),
        name: v.name,
        description: v.description,
        revisionAllowance: p.revisionAllowance,
        requests: p.requests.map((r) => ({
          title: r.title,
          instructions: r.instructions,
          requestType: r.requestType,
          dueOffsetDays: r.dueDate
            ? Math.max(
                0,
                Math.round(
                  (Date.parse(`${r.dueDate}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) /
                    86400000,
                ),
              )
            : null,
        })),
        milestones: p.milestones.map((m) => ({
          title: m.title,
          dueOffsetDays: m.dueDate
            ? Math.max(
                0,
                Math.round(
                  (Date.parse(`${m.dueDate}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) /
                    86400000,
                ),
              )
            : null,
        })),
      }),
    );
  }
  function editTemplate(t: ProjectTemplate) {
    cmdForm(
      'Edit template',
      'Save template',
      [
        { name: 'name', label: 'Template name', required: true, value: t.name },
        {
          name: 'description',
          label: 'Template description',
          type: 'textarea',
          value: t.description,
        },
        {
          name: 'revisionAllowance',
          label: 'Included revision rounds',
          type: 'number',
          value: t.revisionAllowance,
          min: 0,
          max: 1000,
        },
      ],
      (v) => ({
        type: 'template.save',
        ...t,
        name: v.name,
        description: v.description,
        revisionAllowance: Number(v.revisionAllowance),
        requests: t.requests,
        milestones: t.milestones,
      }),
    );
  }
  function reset() {
    confirm(
      'Reset the demo?',
      'This replaces your local demo changes with the sample projects.',
      async () => {
        try {
          const raw = localStorage.getItem(DEMO_KEY);
          let storedVersion = 0;
          try {
            const stored = envelope.safeParse(raw ? JSON.parse(raw) : null);
            if (stored.success) storedVersion = stored.data.version;
          } catch {
            /* An unreadable demo is replaced by the confirmed reset. */
          }
          const nextVersion = Math.max(live.current.view.version, storedVersion) + 1;
          const next = demoView(sampleState('demo', today()), nextVersion);
          localStorage.setItem(
            DEMO_KEY,
            JSON.stringify({ state: next.state, version: nextVersion }),
          );
          setView(next);
          setCorrupt(false);
          setError('');
          setSuccess('Demo reset. A fresh workspace is ready.');
          navigate('Today');
          return true;
        } catch {
          setFailure('Your browser could not save the demo. Check storage permissions.');
          return false;
        }
      },
    );
  }
  const actions = dashboard(state, today(), query);
  const list = state.projects.filter(
    (p) =>
      (filter === 'archived'
        ? p.archived
        : !p.archived && (filter === 'all' || p.status === filter)) &&
      `${p.title} ${state.clients.find((c) => c.id === p.clientId)?.name ?? ''}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const nav = [
    { name: 'Today', icon: Sun },
    { name: 'Projects', icon: FolderOpen },
    ...(owner
      ? [
          { name: 'Clients', icon: Users },
          { name: 'Templates', icon: LayoutTemplate },
          { name: 'Settings', icon: Settings },
        ]
      : []),
  ];
  return (
    <div className="ws-root">
      <aside
        id="workspace-navigation"
        className={`ws-sidebar ${mobile ? 'open' : ''}`}
        onKeyDown={(event) => {
          if (mobile && event.key === 'Escape') {
            event.preventDefault();
            closeNavigation();
          }
        }}
      >
        <Link className="ws-brand" href="/">
          <Layers size={27} />
          clientlane
          <span className="ws-brand-dot" />
        </Link>
        <div className="ws-studio">
          <span className="ws-avatar">{state.settings.brandName.slice(0, 1)}</span>
          <div>
            <strong>{state.settings.brandName}</strong>
            <small>
              {demo ? 'Demo studio' : owner ? 'Owner workspace' : 'Project collaborator'}
            </small>
          </div>
          <button
            className="ws-mobile-close ws-icon"
            aria-label="Close navigation"
            ref={navigationClose}
            onClick={closeNavigation}
          >
            <X size={20} />
          </button>
        </div>
        {view.workspaces.length > 1 && (
          <label className="ws-workspace-select">
            <span>Workspace</span>
            <select
              value={state.workspaceId}
              onChange={(e) => {
                navigate('Today');
                void refresh(e.target.value);
              }}
            >
              {view.workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} · {w.role}
                </option>
              ))}
            </select>
          </label>
        )}
        <nav aria-label="Workspace">
          {nav.map(({ name, icon: Icon }) => (
            <button
              key={name}
              aria-label={name}
              aria-current={page === name ? 'page' : undefined}
              onClick={() => navigate(name)}
            >
              <Icon size={19} />
              {name}
              {name === 'Projects' && (
                <span>{state.projects.filter((p) => !p.archived).length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="ws-sidebar-bottom">
          <div className="ws-sidebar-tip">
            <span>ROOM TO DO GOOD WORK</span>
            <p>A clear next step makes all the difference.</p>
            <CheckCircle2 size={23} />
          </div>
          <div className="ws-profile">
            <span className="ws-avatar small">
              {demo ? 'N' : view.userEmail.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{demo ? 'Northline Studio' : view.userEmail}</strong>
              <small>{demo ? 'Interactive demo' : view.role}</small>
            </div>
          </div>
          {demo ? (
            <button className="ws-logout" onClick={reset}>
              <RotateCcw size={16} />
              Reset demo
            </button>
          ) : (
            <button
              className="ws-logout"
              disabled={busy}
              onClick={() =>
                void external(
                  async () => {
                    const r = await createBrowserSupabase().auth.signOut();
                    return r.error
                      ? { ok: false, error: r.error.message }
                      : { ok: true, data: true };
                  },
                  () => {
                    window.location.assign('/login');
                    return 'Signed out.';
                  },
                )
              }
            >
              <LogOut size={16} />
              Sign out
            </button>
          )}
        </div>
      </aside>
      {mobile && (
        <button
          className="ws-nav-backdrop"
          aria-label="Close navigation overlay"
          onClick={closeNavigation}
        />
      )}
      <div className="ws-body">
        <header className="ws-topbar">
          <div className="ws-breadcrumb">
            <button
              className="ws-mobile-menu ws-icon"
              aria-label="Open navigation"
              aria-expanded={mobile}
              aria-controls="workspace-navigation"
              ref={navigationTrigger}
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span>{state.settings.brandName}</span>
            <span className="ws-muted">/</span>
            <strong>{project ? project.title : page}</strong>
          </div>
          <div className="ws-topbar-right">
            <span className="ws-date">
              {new Date(`${today()}T12:00:00Z`).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                timeZone: 'UTC',
              })}
            </span>
            <span className="ws-avatar small">
              {demo ? 'N' : view.userEmail.slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>
        {demo && (
          <div className="ws-demo-banner" role="region" aria-label="Demo workspace notice">
            <span>
              <strong>Make yourself at home.</strong> This is a local demo. Changes stay in this
              browser.
            </span>
            <Link href="/signup">
              Create your workspace
              <ArrowUpRight size={15} />
            </Link>
          </div>
        )}
        <main id="main" className="ws-main" aria-busy={busy}>
          {!ready && <p role="status">Loading your saved demo…</p>}
          {error && (
            <div className="ws-error" role="alert">
              <span>{error}</span>
              <div className="ws-actions">
                <button className="ws-text-button" disabled={busy} onClick={() => void refresh()}>
                  Reload latest
                </button>
                {demo && (
                  <button className="ws-text-button" onClick={reset}>
                    Reset demo
                  </button>
                )}
              </div>
            </div>
          )}
          {success && (
            <p className="ws-success" role="status">
              {success}
            </p>
          )}
          {busy && (
            <p className="ws-saving" role="status">
              Updating workspace…
            </p>
          )}
          {project ? (
            <>
              <ProjectBoard
                project={project}
                client={preview}
                preview={preview}
                owner={owner}
                currency={state.settings.currency}
                context={{ demo, projectId: project.id, workspaceId: state.workspaceId }}
                onCommand={command}
                openForm={openForm}
                editProject={() => projectForm(project)}
                shareProject={share}
                saveTemplate={() => saveTemplate(project)}
                demoPreview={demo ? () => setPreview(!preview) : undefined}
                back={() => {
                  setSelected(null);
                  setPreview(false);
                  setPortalLink(null);
                }}
              />
              {owner && !preview && (
                <div className="ws-project-admin">
                  {portalLink && (
                    <section className="ws-card ws-share">
                      <h3>Your secure client link</h3>
                      <p className="ws-muted">
                        Expires {new Date(portalLink.expiresAt).toLocaleString()}
                      </p>
                      <label className="ws-field">
                        <span>Client portal URL</span>
                        <input readOnly value={portalLink.url} />
                      </label>
                      <div className="ws-actions">
                        <Button
                          secondary
                          onClick={() =>
                            void navigator.clipboard
                              .writeText(portalLink.url)
                              .then(() => setSuccess('Client link copied.'))
                              .catch(() =>
                                setFailure('Copy failed. Select and copy the URL above.'),
                              )
                          }
                        >
                          Copy client link
                        </Button>
                        <a
                          className="ws-button secondary"
                          href={portalLink.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View client portal
                        </a>
                      </div>
                    </section>
                  )}
                  <div className="ws-actions">
                    <Button
                      secondary
                      disabled={busy}
                      onClick={() =>
                        demo
                          ? setSuccess(
                              'Demo email preview: project invitation ready. No real email sent.',
                            )
                          : void external(
                              () =>
                                api.sendPortalInvite({
                                  workspaceId: state.workspaceId,
                                  projectId: project.id,
                                }),
                              (r) =>
                                r.status === 'sent'
                                  ? 'Invitation accepted by the email server.'
                                  : `Invitation ${r.status}${r.error ? `: ${r.error}` : ''}`,
                            )
                      }
                    >
                      Send client invitation
                    </Button>
                    <Button
                      secondary
                      onClick={() =>
                        confirm(
                          'Revoke client access?',
                          'All existing client links and access to private files will stop working.',
                          async () =>
                            demo
                              ? (setSuccess(
                                  'Demo preview: access revocation simulated. No public token exists.',
                                ),
                                true)
                              : Boolean(
                                  await external(
                                    () =>
                                      api.revokePortal({
                                        workspaceId: state.workspaceId,
                                        projectId: project.id,
                                      }),
                                    () => 'Client access revoked.',
                                  ),
                                ),
                        )
                      }
                    >
                      Revoke client link
                    </Button>
                    <Button
                      secondary
                      onClick={() =>
                        confirm(
                          project.archived ? 'Restore project?' : 'Archive project?',
                          project.archived
                            ? 'This project will become editable again.'
                            : 'Archived projects are retained and become read only.',
                          () =>
                            command({
                              type: 'project.archive',
                              projectId: project.id,
                              archived: !project.archived,
                            }),
                        )
                      }
                    >
                      {project.archived ? 'Restore project' : 'Archive project'}
                    </Button>
                    <button
                      className="ws-text-button danger"
                      onClick={() =>
                        confirm(
                          'Permanently delete this project?',
                          'All project records will be removed. Download your export first if you need a copy.',
                          async () => {
                            const ok = await command({
                              type: 'project.delete',
                              projectId: project.id,
                              confirm: true,
                            });
                            if (ok) setSelected(null);
                            return ok;
                          },
                        )
                      }
                    >
                      Delete project
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {page === 'Today' && (
                <>
                  <div className="ws-page-title">
                    <div>
                      <p className="ws-eyebrow">YOUR WORK, IN A GOOD PLACE</p>
                      <h1>A little clarity for today.</h1>
                      <p className="ws-muted">
                        The next steps that keep your client projects moving.
                      </p>
                    </div>
                    {owner && (
                      <div className="ws-actions">
                        <Button secondary onClick={() => clientForm()}>
                          <Plus size={17} />
                          New client
                        </Button>
                        <Button onClick={() => projectForm()}>
                          <Plus size={17} />
                          New project
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="ws-stats">
                    {[
                      {
                        label: 'Active projects',
                        value: state.projects.filter((p) => !p.archived && p.status !== 'completed')
                          .length,
                        icon: FolderOpen,
                      },
                      { label: 'Waiting on clients', value: actions.waiting.length, icon: Clock3 },
                      {
                        label: 'Ready for review',
                        value: state.projects
                          .filter((p) => !p.archived && p.status !== 'completed')
                          .flatMap((p) => p.deliveries)
                          .filter((d) => !d.versions.at(-1)?.decision).length,
                        icon: MessageIcon,
                      },
                      { label: 'Actions today', value: actions.today.length, icon: Sun },
                    ].map(({ label, value, icon: Icon }) => (
                      <section className="ws-stat" key={label}>
                        <div>
                          <span>{label}</span>
                          <strong>{value.toString().padStart(2, '0')}</strong>
                        </div>
                        <Icon size={22} />
                      </section>
                    ))}
                  </div>
                  <label className="ws-search">
                    <Search size={19} />
                    <input
                      placeholder="Find a project or client…"
                      aria-label="Search projects and clients"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  {!state.projects.length ? (
                    <Empty
                      title="Your next great project starts here."
                      text={
                        owner
                          ? 'Create a client, then a project. You can also load sample projects to explore the workflow.'
                          : 'No projects are assigned yet. Your studio owner can invite you to a project.'
                      }
                    />
                  ) : (
                    <div className="ws-today-grid">
                      <section className="ws-card">
                        <div className="ws-card-heading">
                          <div>
                            <p className="ws-eyebrow">FIRST THINGS FIRST</p>
                            <h2>Your next steps</h2>
                          </div>
                          <span className="ws-count">{actions.today.length}</span>
                        </div>
                        {actions.today.length ? (
                          <ActionItems
                            key={`today-${query}`}
                            kind="today"
                            items={actions.today}
                            onOpen={setSelected}
                          />
                        ) : (
                          <p className="ws-muted">Nothing due today. A little breathing room.</p>
                        )}
                      </section>
                      <section className="ws-card ws-waiting">
                        <div className="ws-card-heading">
                          <div>
                            <p className="ws-eyebrow">A GENTLE NUDGE</p>
                            <h2>Waiting on clients</h2>
                          </div>
                          <span className="ws-count">{actions.waiting.length}</span>
                        </div>
                        <ActionItems
                          key={`waiting-${query}`}
                          kind="waiting"
                          items={actions.waiting}
                          onOpen={setSelected}
                        />
                        {!actions.waiting.length && (
                          <p className="ws-muted">No outstanding client actions.</p>
                        )}
                      </section>
                    </div>
                  )}
                  <section className="ws-card">
                    <div className="ws-card-heading">
                      <div>
                        <p className="ws-eyebrow">A LOOK AHEAD</p>
                        <h2>Coming up</h2>
                      </div>
                      <span className="ws-count">{actions.upcoming.length}</span>
                    </div>
                    <div className="ws-upcoming">
                      <ActionItems
                        key={`upcoming-${query}`}
                        kind="upcoming"
                        items={actions.upcoming}
                        onOpen={setSelected}
                      />
                      {!actions.upcoming.length && (
                        <p className="ws-muted">
                          Add due dates and milestones to see what’s coming.
                        </p>
                      )}
                    </div>
                  </section>
                  {owner && !demo && (
                    <Button
                      secondary
                      onClick={() =>
                        confirm(
                          'Load sample projects?',
                          state.clients.length || state.projects.length
                            ? 'This replaces existing clients and projects and removes access to them. Your settings and templates stay saved. Export your workspace before continuing.'
                            : 'Add sample clients, requests, and deliveries to explore. Your settings and templates stay saved.',
                          async () =>
                            Boolean(
                              await external(
                                () =>
                                  api.loadSample({
                                    workspaceId: state.workspaceId,
                                    version: view.version,
                                    replace: true,
                                  }),
                                (r) => {
                                  setView(r);
                                  return 'Sample projects loaded.';
                                },
                              ),
                            ),
                        )
                      }
                    >
                      Load sample projects
                    </Button>
                  )}
                </>
              )}
              {page === 'Projects' && (
                <>
                  <div className="ws-page-title">
                    <div>
                      <p className="ws-eyebrow">A CLEAR VIEW OF THE WORK</p>
                      <h1>Projects</h1>
                      <p className="ws-muted">From first brief to final handover.</p>
                    </div>
                    {owner && (
                      <div className="ws-actions">
                        <Button secondary onClick={() => setCsv(true)}>
                          Import CSV
                        </Button>
                        <Button onClick={() => projectForm()}>
                          <Plus size={17} />
                          New project
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="ws-filter-bar">
                    <label className="ws-search">
                      <Search size={18} />
                      <input
                        aria-label="Search projects and clients"
                        placeholder="Search projects or clients…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <label className="ws-filter">
                      <span>Status</span>
                      <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                        {['all', 'active', 'waiting', 'review', 'completed', 'archived'].map(
                          (f) => (
                            <option key={f} value={f}>
                              {f === 'all' ? 'All active records' : f}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                  </div>
                  <div className="ws-project-grid">
                    {list.map((p) => (
                      <article className="ws-card ws-project-card" key={p.id}>
                        <div className="ws-card-heading">
                          <span className="ws-project-monogram">{p.title.slice(0, 1)}</span>
                          <span className={`ws-badge ${p.status}`}>
                            {p.archived ? 'archived' : p.status}
                          </span>
                        </div>
                        <h2>
                          <button aria-label={`Open ${p.title}`} onClick={() => setSelected(p.id)}>
                            {p.title}
                            <ArrowUpRight size={20} />
                          </button>
                        </h2>
                        <p className="ws-muted">
                          {state.clients.find((c) => c.id === p.clientId)?.company ||
                            state.clients.find((c) => c.id === p.clientId)?.name}
                        </p>
                        <p>{p.description}</p>
                        <div className="ws-project-card-footer">
                          <span>Due {displayDate(p.dueDate)}</span>
                          <span>
                            {p.requests.filter((r) => r.status === 'received').length}/
                            {p.requests.length} inputs
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                  {!list.length && (
                    <Empty
                      title="A fresh page."
                      text="Create a project or adjust your search and status filter."
                    />
                  )}
                  {owner && (
                    <div className="ws-actions">
                      <Button
                        secondary
                        onClick={() =>
                          download('clientlane-projects.csv', exportProjectsCsv(state), 'text/csv')
                        }
                      >
                        Export projects CSV
                      </Button>
                      <Button
                        secondary
                        onClick={() =>
                          download('clientlane-workspace.json', exportWorkspaceJson(state))
                        }
                      >
                        Export workspace JSON
                      </Button>
                    </div>
                  )}
                </>
              )}
              {page === 'Clients' && owner && (
                <>
                  <div className="ws-page-title">
                    <div>
                      <p className="ws-eyebrow">THE PEOPLE BEHIND THE PROJECTS</p>
                      <h1>Clients</h1>
                      <p className="ws-muted">
                        Keep their details close and their next steps clear.
                      </p>
                    </div>
                    <Button onClick={() => clientForm()}>
                      <Plus size={17} />
                      New client
                    </Button>
                  </div>
                  <label className="ws-search">
                    <Search size={18} />
                    <input
                      aria-label="Search clients"
                      placeholder="Search names, email, or company…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <div className="ws-project-grid">
                    {state.clients
                      .filter((c) =>
                        `${c.name} ${c.email} ${c.company}`
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                      )
                      .map((c) => (
                        <article className="ws-card" key={c.id}>
                          <span className="ws-project-monogram">{c.name.slice(0, 1)}</span>
                          <h2>{c.name}</h2>
                          <p>{c.company}</p>
                          <a href={`mailto:${c.email}`}>{c.email}</a>
                          <p className="ws-muted">
                            {state.projects.filter((p) => p.clientId === c.id).length} projects
                          </p>
                          <div className="ws-actions">
                            <Button secondary onClick={() => clientForm(c)}>
                              Edit client
                            </Button>
                            <button
                              className="ws-text-button danger"
                              onClick={() =>
                                confirm(
                                  `Delete ${c.name}?`,
                                  'A client with existing projects cannot be deleted. Remove their projects first.',
                                  () =>
                                    command({
                                      type: 'client.delete',
                                      clientId: c.id,
                                      confirm: true,
                                    }),
                                )
                              }
                            >
                              Delete client
                            </button>
                          </div>
                        </article>
                      ))}
                  </div>
                  {!state.clients.length && (
                    <Empty
                      title="Your clients belong here."
                      text="Add a client to start your first project."
                    />
                  )}
                </>
              )}
              {page === 'Templates' && owner && (
                <>
                  <div className="ws-page-title">
                    <div>
                      <p className="ws-eyebrow">START WITH A CLEAR PATH</p>
                      <h1>Project templates</h1>
                      <p className="ws-muted">
                        Reusable requests and milestones. Save any project as your own template.
                      </p>
                    </div>
                  </div>
                  <div className="ws-project-grid">
                    {state.templates.map((t) => (
                      <article className="ws-card" key={t.id}>
                        <LayoutTemplate size={27} />
                        <h2>{t.name}</h2>
                        <p>{t.description}</p>
                        <p className="ws-muted">
                          {t.requests.length} requests · {t.milestones.length} milestones ·{' '}
                          {t.revisionAllowance} revision rounds
                        </p>
                        <details>
                          <summary>Preview this template</summary>
                          {t.requests.map((r, i) => (
                            <p key={i}>
                              <strong>{r.title}</strong>
                              <br />
                              {r.instructions} · {r.requestType} · {r.dueOffsetDays ?? 'No'} days
                              from start
                            </p>
                          ))}
                          {t.milestones.map((m, i) => (
                            <p key={i}>
                              {m.title} · {m.dueOffsetDays ?? 'No'} days from start
                            </p>
                          ))}
                        </details>
                        {!BUILTIN_TEMPLATES.some((b) => b.id === t.id) && (
                          <div className="ws-actions">
                            <Button secondary onClick={() => editTemplate(t)}>
                              Edit template
                            </Button>
                            <button
                              className="ws-text-button danger"
                              onClick={() =>
                                confirm(
                                  'Delete this template?',
                                  'Existing projects keep their requests and milestones.',
                                  () => command({ type: 'template.delete', templateId: t.id }),
                                )
                              }
                            >
                              Delete template
                            </button>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                </>
              )}
              {page === 'Settings' && owner && (
                <>
                  <div className="ws-page-title">
                    <div>
                      <p className="ws-eyebrow">MAKE IT YOURS</p>
                      <h1>Studio settings</h1>
                      <p className="ws-muted">
                        Your brand, your team, and the way you keep clients informed.
                      </p>
                    </div>
                  </div>
                  <section className="ws-card">
                    <div className="ws-card-heading">
                      <div>
                        <h2>{state.settings.brandName}</h2>
                        <p className="ws-muted">
                          {state.settings.currency} · Weekly digest{' '}
                          {state.settings.weeklyDigest ? 'enabled' : 'disabled'}
                        </p>
                      </div>
                      <span
                        style={{ background: state.settings.brandColor }}
                        className="ws-brand-swatch"
                      />
                    </div>
                    <Button
                      onClick={() =>
                        cmdForm(
                          'Studio branding & notifications',
                          'Save settings',
                          [
                            {
                              name: 'brandName',
                              label: 'Studio name',
                              value: state.settings.brandName,
                              required: true,
                            },
                            {
                              name: 'brandColor',
                              label: 'Brand color',
                              type: 'color',
                              value: state.settings.brandColor,
                            },
                            {
                              name: 'logoUrl',
                              label: 'Logo HTTPS URL',
                              type: 'url',
                              value: state.settings.logoUrl,
                            },
                            {
                              name: 'currency',
                              label: 'Default currency',
                              type: 'select',
                              value: state.settings.currency,
                              options: ['USD', 'EUR', 'GBP', 'PKR', 'CAD', 'AUD'].map((value) => ({
                                value,
                                label: value,
                              })),
                            },
                            {
                              name: 'weeklyDigest',
                              label: 'Weekly client digest',
                              type: 'checkbox',
                              value: state.settings.weeklyDigest,
                            },
                          ],
                          (v) => ({
                            type: 'settings.update',
                            brandName: v.brandName,
                            brandColor: v.brandColor,
                            logoUrl: dateValue(v.logoUrl),
                            currency: v.currency,
                            weeklyDigest: Boolean(v.weeklyDigest),
                          }),
                        )
                      }
                    >
                      Edit studio settings
                    </Button>
                  </section>
                  <section className="ws-card">
                    <div className="ws-card-heading">
                      <div>
                        <p className="ws-eyebrow">OPTIONAL COLLABORATION</p>
                        <h2>Your team</h2>
                      </div>
                      <div className="ws-actions">
                        {!demo && (
                          <Button
                            secondary
                            disabled={busy}
                            onClick={() =>
                              void external(
                                () => api.listMembers(state.workspaceId),
                                (data) => {
                                  setTeam(data);
                                  return 'Team members refreshed.';
                                },
                              )
                            }
                          >
                            Refresh team
                          </Button>
                        )}
                        <Button
                          onClick={() =>
                            openForm({
                              title: 'Invite a teammate',
                              submit: demo ? 'Preview team invitation' : 'Send team invitation',
                              description: demo
                                ? 'Local email preview. No invitation or real email is sent.'
                                : 'They’ll sign in with this email and confirm the invitation. Access is limited to selected projects.',
                              fields: [
                                {
                                  name: 'email',
                                  label: 'Teammate email',
                                  type: 'email',
                                  required: true,
                                },
                                ...state.projects.map((p) => ({
                                  name: `scope-${p.id}`,
                                  label: `Access to ${p.title}`,
                                  type: 'checkbox' as const,
                                  value: false,
                                })),
                              ],
                              onSubmit: async (v) => {
                                const projectIds = state.projects
                                  .filter((p) => v[`scope-${p.id}`])
                                  .map((p) => p.id);
                                if (!projectIds.length)
                                  throw new Error('Select at least one project.');
                                if (demo) {
                                  setSuccess(
                                    `Demo invitation preview for ${v.email}: ${projectIds.length} selected projects. No email sent.`,
                                  );
                                  return true;
                                }
                                const r = await external(
                                  () =>
                                    api.inviteMember({
                                      workspaceId: state.workspaceId,
                                      email: v.email,
                                      projectIds,
                                    }),
                                  (data) =>
                                    data.status === 'sent'
                                      ? 'Team invitation accepted by the email server.'
                                      : `Team invitation ${data.status}${data.error ? `: ${data.error}` : ''}`,
                                );
                                if (r) {
                                  setSuccess(`Invitation ${r.status}. Link: ${r.url}`);
                                  await updateTeam();
                                }
                                return Boolean(r);
                              },
                            })
                          }
                        >
                          Invite teammate
                        </Button>
                      </div>
                    </div>
                    {demo && (
                      <p className="ws-muted">
                        Team invitations are email previews in this demo. Create an account to
                        invite real collaborators.
                      </p>
                    )}
                    {team?.members.map((m) => (
                      <div className="ws-team-row" key={m.user_id}>
                        <div>
                          <strong>{m.email}</strong>
                          <small>
                            {m.project_ids
                              .map((id: string) => state.projects.find((p) => p.id === id)?.title)
                              .join(', ')}
                          </small>
                        </div>
                        <span>{m.revoked_at ? 'Revoked' : 'Active'}</span>
                        {!m.revoked_at && (
                          <button
                            className="ws-text-button danger"
                            onClick={() =>
                              confirm(
                                'Revoke this teammate’s access?',
                                'Their access to this workspace and its files will stop.',
                                async () => {
                                  const r = await external(
                                    () =>
                                      api.revokeMember({
                                        workspaceId: state.workspaceId,
                                        memberId: m.user_id,
                                      }),
                                    () => 'Teammate access revoked.',
                                  );
                                  await updateTeam();
                                  return Boolean(r);
                                },
                              )
                            }
                          >
                            Revoke teammate
                          </button>
                        )}
                      </div>
                    ))}
                    {team?.invitations.map((i) => (
                      <div className="ws-team-row" key={i.id}>
                        <div>
                          <strong>{i.email}</strong>
                          <small>
                            Expires {new Date(i.expires_at).toLocaleDateString()} ·{' '}
                            {i.project_ids.length} projects
                          </small>
                        </div>
                        <span>
                          {i.revoked_at ? 'Revoked' : i.accepted_at ? 'Accepted' : 'Invited'}
                        </span>
                        {!i.revoked_at && !i.accepted_at && (
                          <button
                            className="ws-text-button danger"
                            onClick={() =>
                              confirm(
                                'Revoke this invitation?',
                                'This invitation link will stop working.',
                                async () => {
                                  const r = await external(
                                    () =>
                                      api.revokeMemberInvite({
                                        workspaceId: state.workspaceId,
                                        invitationId: i.id,
                                      }),
                                    () => 'Invitation revoked.',
                                  );
                                  await updateTeam();
                                  return Boolean(r);
                                },
                              )
                            }
                          >
                            Revoke invitation
                          </button>
                        )}
                      </div>
                    ))}
                  </section>
                  <section className="ws-card">
                    <div className="ws-card-heading">
                      <div>
                        <p className="ws-eyebrow">DELIVERY STATUS</p>
                        <h2>Email activity</h2>
                      </div>
                      {!demo && (
                        <Button
                          secondary
                          onClick={() =>
                            void external(
                              () => api.listEmailQueue(state.workspaceId),
                              (rows) => {
                                setEmails(rows);
                                return 'Email activity refreshed.';
                              },
                            )
                          }
                        >
                          Refresh email activity
                        </Button>
                      )}
                    </div>
                    {demo ? (
                      <p className="ws-muted">Demo email previews never send real email.</p>
                    ) : emails.length ? (
                      emails.map((email) => (
                        <div className="ws-team-row" key={email.id}>
                          <div>
                            <strong>{email.kind.replaceAll('_', ' ')}</strong>
                            <small>{new Date(email.created_at).toLocaleString()}</small>
                            {email.error && <p className="ws-error">{email.error}</p>}
                          </div>
                          <span className="ws-badge">{email.status}</span>
                          {email.status === 'error' && (
                            <Button
                              secondary
                              disabled={busy}
                              onClick={() =>
                                void external(
                                  () =>
                                    api.retryEmail({
                                      workspaceId: state.workspaceId,
                                      queueId: email.id,
                                    }),
                                  (r) => {
                                    setEmails((rows) =>
                                      rows.map((row) => (row.id === r.id ? { ...row, ...r } : row)),
                                    );
                                    return r.status === 'sent'
                                      ? 'Email accepted by the email server.'
                                      : `Email ${r.status}${r.error ? `: ${r.error}` : ''}`;
                                  },
                                )
                              }
                            >
                              Retry email
                            </Button>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="ws-muted">
                        No emails yet. Create a client link and send a project invitation.
                      </p>
                    )}
                  </section>
                  <section className="ws-card">
                    <h2>Keep a copy of your work.</h2>
                    <p className="ws-muted">
                      Download your clients, project records, agreements, and settings.
                    </p>
                    <div className="ws-actions">
                      <Button
                        secondary
                        onClick={() =>
                          download('clientlane-projects.csv', exportProjectsCsv(state), 'text/csv')
                        }
                      >
                        <Download size={17} />
                        Export projects CSV
                      </Button>
                      <Button
                        secondary
                        onClick={() =>
                          download('clientlane-workspace.json', exportWorkspaceJson(state))
                        }
                      >
                        <Download size={17} />
                        Export workspace JSON
                      </Button>
                    </div>
                  </section>
                </>
              )}
            </>
          )}
        </main>
      </div>
      {modal && (
        <FormDialog
          spec={modal}
          onClose={() => setModal(null)}
          context={{ demo, projectId: project?.id, workspaceId: state.workspaceId }}
        />
      )}
      {csv && (
        <CsvDialog
          onClose={() => setCsv(false)}
          onImport={async (rows) => {
            const ok = await command({ type: 'projects.import', rows });
            if (!ok) throw new Error(errorRef.current);
            return ok;
          }}
        />
      )}
    </div>
  );
}
function MessageIcon({ size }: { size: number }) {
  return <CheckCircle2 size={size} />;
}
function ActionItems({
  items,
  kind,
  onOpen,
}: {
  items: DashboardItem[];
  kind: 'today' | 'waiting' | 'upcoming';
  onOpen: (id: string) => void;
}) {
  const [limit, setLimit] = useState(10);
  return (
    <>
      {items.slice(0, limit).map((a, i) => (
        <button
          className="ws-action-row"
          key={`${a.projectId}-${a.itemId}-${i}`}
          onClick={() => onOpen(a.projectId)}
        >
          {kind === 'today' && (
            <span className="ws-action-marker">
              <ArrowUpRight size={16} />
            </span>
          )}
          <span>
            <strong>{a.action}</strong>
            <small>
              {a.projectTitle}
              {kind === 'today' ? ` · ${a.clientName}` : ''}
            </small>
            {kind !== 'upcoming' && (
              <small>
                {kind === 'waiting' && a.delayDays
                  ? `${a.delayDays} days delayed`
                  : displayDate(a.dueDate)}
              </small>
            )}
          </span>
          {kind === 'upcoming' ? (
            <small>{displayDate(a.dueDate)}</small>
          ) : (
            <ArrowUpRight size={17} />
          )}
        </button>
      ))}
      {items.length > 10 && (
        <div className="ws-list-more">
          <small>
            Showing {Math.min(limit, items.length)} of {items.length}
          </small>
          {limit < items.length && (
            <Button
              secondary
              aria-label={`Show more ${kind} actions`}
              onClick={() => setLimit((n) => n + 10)}
            >
              Show more
            </Button>
          )}
        </div>
      )}
    </>
  );
}
function CsvDialog({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (rows: CsvPreview['rows']) => Promise<boolean>;
}) {
  const [preview, setPreview] = useState<CsvPreview | null>(null),
    [source, setSource] = useState('');
  const sample =
    'title,clientName,clientEmail,company,description,dueDate,revisionAllowance\nWebsite launch,Nora Lee,nora@example.test,Studio,A clear new website,2026-12-01,2';
  return (
    <FormDialog
      onClose={onClose}
      spec={{
        title: 'Import projects from CSV',
        submit: preview?.rows.length
          ? `Import ${preview.rows.length} project${preview.rows.length === 1 ? '' : 's'}`
          : 'Preview import',
        description:
          'Required headers: title, clientName, clientEmail, description, dueDate, revisionAllowance. Optional company, status, archived. All rows must be valid before import.',
        fields: [{ name: 'csv', label: 'CSV content', type: 'textarea', required: true }],
        content: (
          <>
            <Button
              secondary
              onClick={() => download('clientlane-import-sample.csv', sample, 'text/csv')}
            >
              Download sample CSV
            </Button>
            <label className="ws-field">
              <span>Choose CSV file</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const input = e.target
                    .closest('form')
                    ?.querySelector<HTMLTextAreaElement>('[name="csv"]');
                  if (input) input.value = await f.text();
                  setPreview(null);
                }}
              />
            </label>
            {preview && (
              <div className="ws-import-preview">
                {preview.errors.map((e, i) => (
                  <p role="alert" className="ws-error" key={i}>
                    Row {e.row}: {e.message}
                  </p>
                ))}
                {preview.rows.length > 0 && (
                  <>
                    <h3>
                      {preview.rows.length} project{preview.rows.length === 1 ? '' : 's'} ready to
                      import
                    </h3>
                    {preview.rows.map((r, i) => (
                      <div className="ws-response" key={i}>
                        <strong>{r.title}</strong>
                        <p>
                          {r.clientName} · {r.clientEmail} · {r.company}
                        </p>
                        <p>{r.description}</p>
                        <small>
                          {displayDate(r.dueDate)} · {r.revisionAllowance} revisions
                        </small>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </>
        ),
        onSubmit: async (v) => {
          if (preview?.rows.length && source === v.csv) return onImport(preview.rows);
          const parsed = parseProjectsCsv(v.csv);
          setSource(v.csv);
          setPreview(parsed);
          return false;
        },
      }}
    />
  );
}
