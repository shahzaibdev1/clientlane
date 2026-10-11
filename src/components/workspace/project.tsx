'use client';
import { useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Plus,
  MessageSquare,
  CalendarDays,
  LockKeyhole,
  Download,
  Paperclip,
} from 'lucide-react';
import {
  commandSchema,
  revisionSummary,
  formatMoney,
  type Command,
  type Project,
  type PortalProject,
  type Delivery,
  type Request,
  type Currency,
} from '@/lib/domain';
import {
  Button,
  FileLinks,
  dateValue,
  uid,
  download,
  type FormSpec,
  type Field,
  type FileContext,
} from './forms';
import { parseAmountCents } from './money';

export type ProjectProps = {
  project: Project | PortalProject;
  client?: boolean;
  owner?: boolean;
  currency: Currency;
  context: FileContext;
  onCommand: (command: Command) => Promise<boolean>;
  openForm: (spec: FormSpec) => void;
  editProject?: () => void;
  shareProject?: () => void;
  saveTemplate?: () => void;
  demoPreview?: () => void;
  back?: () => void;
  preview?: boolean;
};
const titleField = (label = 'Title', value = ''): Field => ({
  name: 'title',
  label,
  required: true,
  value,
});
const dueField = (value: string | null = null): Field => ({
  name: 'dueDate',
  label: 'Due date',
  type: 'date',
  value,
});
const noteField = (label = 'Note', name = 'note', value = ''): Field => ({
  name,
  label,
  type: 'textarea',
  value,
});
const stamp = (date: string) =>
  new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
export const displayDate = (date: string | null) =>
  date ? stamp(`${date}T12:00:00Z`) : 'No due date';
export const authorName = (name: string) =>
  /^[0-9a-f-]{36}$/i.test(name) || name === 'demo-owner' ? 'Project team' : name;
export function ProjectBoard(props: ProjectProps) {
  const { project: p, client = false, owner = false, onCommand, openForm, context } = props;
  const [tab, setTab] = useState('Overview');
  const rev = revisionSummary(p);
  const readOnly = p.archived;
  const run = (raw: unknown) => onCommand(commandSchema.parse(raw));
  const form = (
    title: string,
    submit: string,
    fields: Field[],
    make: (v: Record<string, string>) => unknown,
  ) => openForm({ title, submit, fields, onSubmit: async (v) => run(make(v)) });
  const confirm = (title: string, command: Command) =>
    openForm({
      title,
      submit: 'Confirm',
      description: 'This action updates the project for everyone with access.',
      onSubmit: () => onCommand(command),
    });
  const requestForm = (r?: Request) =>
    form(
      r ? 'Edit request' : 'New request',
      r ? 'Save request' : 'Create request',
      [
        titleField('Request title', r?.title),
        noteField('Instructions', 'instructions', r?.instructions),
        {
          name: 'requestType',
          label: 'Response type',
          type: 'select',
          value: r?.requestType ?? 'text',
          options: [
            { value: 'text', label: 'Text response' },
            { value: 'file', label: 'File attachment' },
          ],
        },
        dueField(r?.dueDate),
        {
          name: 'reminders',
          label: 'Enable email reminders',
          type: 'checkbox',
          value: r?.reminder?.enabled ?? false,
        },
        {
          name: 'intervalDays',
          label: 'Reminder interval (days)',
          type: 'number',
          value: r?.reminder?.intervalDays ?? 3,
          min: 1,
          max: 90,
        },
        {
          name: 'nextDueDate',
          label: 'Next reminder date',
          type: 'date',
          value: r?.reminder?.nextDueDate ?? new Date().toISOString().slice(0, 10),
        },
      ],
      (v) => ({
        type: r ? 'request.update' : 'request.create',
        projectId: p.id,
        ...(r ? { requestId: r.id } : { id: uid() }),
        title: v.title,
        instructions: v.instructions,
        requestType: v.requestType,
        dueDate: dateValue(v.dueDate),
        reminder: v.reminders
          ? { enabled: true, intervalDays: Number(v.intervalDays), nextDueDate: v.nextDueDate }
          : null,
      }),
    );
  const respond = (r: Request) =>
    openForm({
      title: `Respond to ${r.title}`,
      submit: 'Send response',
      description: r.instructions,
      fields: [noteField('Response', 'text')],
      attachments: true,
      onSubmit: async (v, files) =>
        run({ type: 'request.submit', projectId: p.id, requestId: r.id, text: v.text, files }),
    });
  const requestCards = (
    <div className="ws-stack">
      {p.requests.map((r) => (
        <article className="ws-card" key={r.id}>
          <div className="ws-card-heading">
            <div>
              <p className="ws-eyebrow">
                {r.requestType === 'file' ? 'FILE REQUEST' : 'CLIENT INPUT'} ·{' '}
                {displayDate(r.dueDate)}
              </p>
              <h3>{r.title}</h3>
            </div>
            <span className={`ws-badge ${r.status}`}>{r.status}</span>
          </div>
          <p>{r.instructions}</p>
          {r.rejectionReason && <p className="ws-error">Please revise: {r.rejectionReason}</p>}
          {r.response && (
            <div className="ws-response">
              <p>{r.response.text}</p>
              <FileLinks files={r.response.files} token={context.token} />
              <small>
                {authorName(r.response.author)} · {stamp(r.response.submittedAt)}
              </small>
            </div>
          )}
          {!client &&
            r.responseHistory.length > 0 &&
            (!r.response || r.responseHistory.length > 1) && (
              <details>
                <summary>Response history ({r.responseHistory.length})</summary>
                {r.responseHistory.map((h, i) => (
                  <div className="ws-response" key={i}>
                    <p>{h.text}</p>
                    <FileLinks files={h.files} token={context.token} />
                    <small>
                      {authorName(h.author)} · {stamp(h.submittedAt)}
                    </small>
                  </div>
                ))}
              </details>
            )}
          {!client && r.reminder && (
            <p className="ws-muted">
              {p.archived
                ? 'Reminders paused — project archived.'
                : p.status === 'completed'
                  ? 'Reminders paused — project completed.'
                  : r.status === 'received'
                    ? 'Reminders paused — input received.'
                    : r.reminder.enabled
                      ? `Reminders enabled · every ${r.reminder.intervalDays} days · next ${displayDate(r.reminder.nextDueDate)}`
                      : 'Reminder emails are paused.'}
            </p>
          )}
          {!readOnly && (
            <div className="ws-actions">
              {client ? (
                r.status !== 'received' && (
                  <Button onClick={() => respond(r)}>
                    <ArrowUpRight size={16} />
                    Respond to {r.title}
                  </Button>
                )
              ) : (
                <>
                  <Button secondary onClick={() => requestForm(r)}>
                    Edit request
                  </Button>
                  {r.status === 'received' && (
                    <Button
                      secondary
                      onClick={() =>
                        form(
                          'Request a correction',
                          'Reject response',
                          [
                            {
                              name: 'reason',
                              label: 'Reason for rejection',
                              type: 'textarea',
                              required: true,
                            },
                          ],
                          (v) => ({
                            type: 'request.reject',
                            projectId: p.id,
                            requestId: r.id,
                            reason: v.reason,
                          }),
                        )
                      }
                    >
                      Reject response
                    </Button>
                  )}
                  {r.status !== 'pending' && (
                    <Button
                      secondary
                      onClick={() =>
                        void run({ type: 'request.reopen', projectId: p.id, requestId: r.id })
                      }
                    >
                      Reopen request
                    </Button>
                  )}
                  <button
                    className="ws-text-button danger"
                    onClick={() =>
                      confirm(`Delete ${r.title}?`, {
                        type: 'request.delete',
                        projectId: p.id,
                        requestId: r.id,
                      })
                    }
                  >
                    Delete request
                  </button>
                </>
              )}
            </div>
          )}
        </article>
      ))}
      {p.requests.length === 0 && (
        <Empty
          title="No inputs to chase."
          text="Add a request when you need content, decisions, or files from your client."
        />
      )}
    </div>
  );
  const milestoneForm = (m?: Project['milestones'][number]) =>
    form(
      m ? 'Edit milestone' : 'New milestone',
      m ? 'Save milestone' : 'Create milestone',
      [titleField('Milestone title', m?.title), dueField(m?.dueDate)],
      (v) => ({
        type: m ? 'milestone.update' : 'milestone.create',
        projectId: p.id,
        ...(m ? { milestoneId: m.id } : { id: uid() }),
        title: v.title,
        dueDate: dateValue(v.dueDate),
      }),
    );
  const milestones = (
    <section className="ws-card">
      <div className="ws-card-heading">
        <div>
          <p className="ws-eyebrow">THE PATH FORWARD</p>
          <h3>Milestones</h3>
        </div>
        {!client && !readOnly && tab !== 'Handover' && (
          <Button secondary onClick={() => milestoneForm()}>
            <Plus size={16} />
            New milestone
          </Button>
        )}
      </div>
      {p.milestones.length === 0 && (
        <p className="ws-muted">No milestones yet. Add a few meaningful steps.</p>
      )}
      {p.milestones.map((m) => (
        <div className="ws-milestone" key={m.id}>
          <span className={`ws-step ${m.completed ? 'done' : ''}`}>
            {m.completed ? <Check size={17} /> : <CalendarDays size={17} />}
          </span>
          <div>
            <strong>{m.title}</strong>
            <small>
              {displayDate(m.dueDate)} · {m.completed ? 'Complete' : 'Upcoming'}
            </small>
          </div>
          {!client && !readOnly && tab !== 'Handover' && (
            <div className="ws-actions">
              <button
                className="ws-text-button"
                onClick={() =>
                  void run({
                    type: 'milestone.update',
                    projectId: p.id,
                    milestoneId: m.id,
                    completed: !m.completed,
                  })
                }
              >
                {m.completed ? 'Mark incomplete' : 'Complete'}
              </button>
              <button className="ws-text-button" onClick={() => milestoneForm(m)}>
                Edit
              </button>
              <button
                className="ws-text-button danger"
                onClick={() =>
                  confirm(`Delete ${m.title}?`, {
                    type: 'milestone.delete',
                    projectId: p.id,
                    milestoneId: m.id,
                  })
                }
              >
                Delete
              </button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
  const publish = (d?: Delivery) =>
    openForm({
      title: d ? 'Publish new version' : 'Publish a delivery',
      submit: 'Publish version',
      description: 'Each version keeps its own files, feedback, and client decision.',
      fields: [titleField('Delivery title', d?.title), noteField('Delivery note')],
      attachments: true,
      onSubmit: async (v, files) =>
        run({
          type: 'delivery.publish',
          projectId: p.id,
          deliveryId: d?.id ?? uid(),
          versionId: uid(),
          title: v.title,
          note: v.note,
          files,
        }),
    });
  return (
    <div className={`ws-project ${client ? 'client-view' : ''}`}>
      <div className="ws-project-top">
        {props.back && (
          <button className="ws-text-button" onClick={props.back}>
            ← All projects
          </button>
        )}
        <div className="ws-actions">
          {props.demoPreview && (
            <Button secondary onClick={props.demoPreview}>
              {props.preview ? 'Back to studio' : 'Client preview'}
            </Button>
          )}
          {!client && props.shareProject && owner && (
            <Button onClick={props.shareProject}>
              Share client link
              <ArrowUpRight size={16} />
            </Button>
          )}
        </div>
      </div>
      {props.preview && (
        <p className="ws-demo-note">
          CLIENT PREVIEW · You are acting as the client in this local demo.
        </p>
      )}
      <div className="ws-project-title">
        <div>
          <p className="ws-eyebrow">{client ? 'YOUR PROJECT' : 'PROJECT WORKSPACE'}</p>
          <h1>{p.title}</h1>
          <p className="ws-muted">{p.description}</p>
        </div>
        <span className={`ws-badge ${p.status}`}>{p.archived ? 'archived' : p.status}</span>
      </div>
      <div className="ws-project-meta">
        <span>
          <CalendarDays size={17} />
          Due {displayDate(p.dueDate)}
        </span>
        <span>{rev.included} included</span>
        <span>{rev.used} used</span>
        <span>{rev.remaining} remaining</span>
        {!client && props.editProject && !readOnly && (
          <button className="ws-text-button" onClick={props.editProject}>
            Edit project
          </button>
        )}
      </div>
      {readOnly && (
        <p className="ws-notice">This archived project is read only. The studio can restore it.</p>
      )}
      <nav className="ws-tabs" aria-label="Project sections">
        {[
          'Overview',
          'Requests',
          'Deliveries',
          'Agreements',
          ...(!client ? ['Notes'] : []),
          'Handover',
        ].map((t) => (
          <button aria-current={tab === t ? 'page' : undefined} key={t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      {tab === 'Overview' && (
        <>
          <div className="ws-section-title">
            <h2>{client ? 'Your next action' : 'Keep this project moving.'}</h2>
          </div>
          {client ? (
            requestCards
          ) : (
            <div className="ws-overview-grid">
              <section className="ws-card">
                <p className="ws-eyebrow">WAITING ON INPUTS</p>
                <h3>{p.requests.filter((r) => r.status !== 'received').length} missing inputs</h3>
                {p.requests
                  .filter((r) => r.status !== 'received')
                  .map((r) => (
                    <button key={r.id} className="ws-action-row" onClick={() => setTab('Requests')}>
                      <span>
                        {r.title}
                        <small>{displayDate(r.dueDate)}</small>
                      </span>
                      <ArrowUpRight size={18} />
                    </button>
                  ))}
                {!p.requests.length && (
                  <p className="ws-muted">Ready when you are. Add your first request.</p>
                )}
              </section>
              <section className="ws-card">
                <p className="ws-eyebrow">READY FOR REVIEW</p>
                <h3>
                  {p.deliveries.filter((d) => !d.versions.at(-1)?.decision).length} awaiting
                  decisions
                </h3>
                {p.deliveries.map((d) => (
                  <button className="ws-action-row" key={d.id} onClick={() => setTab('Deliveries')}>
                    <span>
                      {d.title}
                      <small>
                        Version {d.versions.at(-1)?.number} ·{' '}
                        {d.versions.at(-1)?.decision?.value ?? 'Awaiting review'}
                      </small>
                    </span>
                    <ArrowUpRight size={18} />
                  </button>
                ))}
              </section>
            </div>
          )}
          {milestones}
          <section className="ws-card">
            <p className="ws-eyebrow">PROJECT TIMELINE</p>
            <h3>Recent activity</h3>
            {p.events
              .slice(-8)
              .reverse()
              .map((e) => (
                <div className="ws-timeline-row" key={e.id}>
                  <span>{e.message}</span>
                  <small>
                    {authorName(e.author)} · {stamp(e.at)}
                  </small>
                </div>
              ))}
            {p.events.length === 0 && <p className="ws-muted">Your project story begins here.</p>}
          </section>
        </>
      )}
      {tab === 'Requests' && (
        <>
          <div className="ws-section-title">
            <div>
              <h2>Everything you need to get started.</h2>
              <p className="ws-muted">Clear requests. One place for every response.</p>
            </div>
            {!client && !readOnly && (
              <Button onClick={() => requestForm()}>
                <Plus size={17} />
                New request
              </Button>
            )}
          </div>
          {requestCards}
        </>
      )}
      {tab === 'Deliveries' && (
        <>
          <div className="ws-section-title">
            <div>
              <h2>Good work, ready for feedback.</h2>
              <p className="ws-muted">Review each version and keep every decision in context.</p>
            </div>
            {!client && !readOnly && (
              <Button onClick={() => publish()}>
                <Plus size={17} />
                Publish delivery
              </Button>
            )}
          </div>
          <div className="ws-stack">
            {p.deliveries.map((d) => (
              <DeliveryCard
                key={d.id}
                delivery={d}
                projectId={p.id}
                client={client}
                readonly={readOnly}
                token={context.token}
                onCommand={onCommand}
                openForm={openForm}
                publish={() => publish(d)}
              />
            ))}
            {p.deliveries.length === 0 && (
              <Empty
                title="Make room for your best work."
                text="Publish your first delivery when it’s ready for client feedback."
              />
            )}
          </div>
        </>
      )}
      {tab === 'Agreements' && (
        <>
          <div className="ws-section-title">
            <div>
              <h2>Agree before moving ahead.</h2>
              <p className="ws-muted">
                Extra work and revised dates, with a clear record. No payments are collected.
              </p>
            </div>
            {!readOnly &&
              (client ? (
                <Button
                  onClick={() =>
                    form(
                      'Request extra work',
                      'Send change request',
                      [
                        titleField('Change title'),
                        {
                          name: 'description',
                          label: 'What would you like to add?',
                          type: 'textarea',
                          required: true,
                        },
                      ],
                      (v) => ({
                        type: 'change.request',
                        projectId: p.id,
                        id: uid(),
                        title: v.title,
                        description: v.description,
                      }),
                    )
                  }
                >
                  <Plus size={17} />
                  Request extra work
                </Button>
              ) : (
                <Button
                  onClick={() =>
                    form(
                      'Propose a new deadline',
                      'Send deadline proposal',
                      [
                        {
                          name: 'dueDate',
                          label: 'Proposed deadline',
                          type: 'date',
                          required: true,
                        },
                        {
                          name: 'reason',
                          label: 'Reason for the new deadline',
                          type: 'textarea',
                          required: true,
                        },
                      ],
                      (v) => ({
                        type: 'deadline.propose',
                        projectId: p.id,
                        id: uid(),
                        dueDate: v.dueDate,
                        reason: v.reason,
                      }),
                    )
                  }
                >
                  Propose new deadline
                </Button>
              ))}
          </div>
          <div className="ws-stack">
            {p.changes.map((c) => (
              <section className="ws-card" key={c.id}>
                <div className="ws-card-heading">
                  <div>
                    <p className="ws-eyebrow">EXTRA WORK · {authorName(c.requestedBy)}</p>
                    <h3>{c.title}</h3>
                  </div>
                  <span className={`ws-badge ${c.status}`}>{c.status}</span>
                </div>
                <p>{c.description}</p>
                {c.quote && (
                  <div className="ws-quote">
                    <strong>{formatMoney(c.quote.amountCents, c.quote.currency)}</strong>
                    <span>Due {displayDate(c.quote.dueDate)}</span>
                    <p>{c.quote.note}</p>
                    <small>
                      Quoted by {authorName(c.quote.author)} · {stamp(c.quote.at)}
                    </small>
                  </div>
                )}
                {c.response && (
                  <p className="ws-muted">
                    {c.status === 'accepted' ? 'Accepted' : 'Declined'} by{' '}
                    {authorName(c.response.author)} · {stamp(c.response.at)}
                  </p>
                )}
                {!readOnly && (
                  <div className="ws-actions">
                    {owner && !client && c.status === 'requested' && (
                      <Button
                        onClick={() =>
                          form(
                            `Quote ${c.title}`,
                            'Publish quote',
                            [
                              {
                                name: 'amount',
                                label: 'Quote amount',
                                type: 'number',
                                value: 0,
                                min: 0,
                                step: '0.01',
                                required: true,
                              },
                              {
                                name: 'currency',
                                label: 'Currency',
                                type: 'select',
                                value: props.currency,
                                options: ['USD', 'EUR', 'GBP', 'PKR', 'CAD', 'AUD'].map(
                                  (value) => ({ value, label: value }),
                                ),
                              },
                              dueField(),
                              noteField('Quote note'),
                            ],
                            (v) => {
                              const amountCents = parseAmountCents(v.amount);
                              return {
                                type: 'change.quote',
                                projectId: p.id,
                                changeId: c.id,
                                amountCents,
                                currency: v.currency,
                                dueDate: dateValue(v.dueDate),
                                note: v.note,
                              };
                            },
                          )
                        }
                      >
                        Publish quote
                      </Button>
                    )}
                    {client && c.status === 'quoted' && (
                      <>
                        <Button
                          onClick={() =>
                            confirm(`Accept the quote for ${c.title}?`, {
                              type: 'change.respond',
                              projectId: p.id,
                              changeId: c.id,
                              accepted: true,
                            })
                          }
                        >
                          Accept quote
                        </Button>
                        <Button
                          secondary
                          onClick={() =>
                            confirm(`Decline the quote for ${c.title}?`, {
                              type: 'change.respond',
                              projectId: p.id,
                              changeId: c.id,
                              accepted: false,
                            })
                          }
                        >
                          Decline quote
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </section>
            ))}
            {p.deadlineProposals.map((d) => (
              <section className="ws-card" key={d.id}>
                <div className="ws-card-heading">
                  <div>
                    <p className="ws-eyebrow">DEADLINE AGREEMENT</p>
                    <h3>
                      {displayDate(d.previousDueDate)} → {displayDate(d.dueDate)}
                    </h3>
                  </div>
                  <span className={`ws-badge ${d.status}`}>{d.status}</span>
                </div>
                <p>{d.reason}</p>
                <p className="ws-muted">
                  Proposed by {authorName(d.proposedBy)} · {stamp(d.proposedAt)}
                </p>
                {d.response && (
                  <p className="ws-muted">
                    {d.status === 'accepted' ? 'Accepted' : 'Declined'} by{' '}
                    {authorName(d.response.author)} · {stamp(d.response.at)}
                  </p>
                )}
                {client && d.status === 'pending' && !readOnly && (
                  <div className="ws-actions">
                    <Button
                      onClick={() =>
                        confirm('Accept the new deadline?', {
                          type: 'deadline.respond',
                          projectId: p.id,
                          proposalId: d.id,
                          accepted: true,
                        })
                      }
                    >
                      Accept deadline
                    </Button>
                    <Button
                      secondary
                      onClick={() =>
                        confirm('Decline the new deadline?', {
                          type: 'deadline.respond',
                          projectId: p.id,
                          proposalId: d.id,
                          accepted: false,
                        })
                      }
                    >
                      Decline deadline
                    </Button>
                  </div>
                )}
              </section>
            ))}
            {!p.changes.length && !p.deadlineProposals.length && (
              <Empty
                title="Everyone on the same page."
                text="Quotes and deadline agreements will appear here."
              />
            )}
          </div>
        </>
      )}
      {tab === 'Notes' && !client && 'internalNotes' in p && (
        <>
          <div className="ws-section-title">
            <div>
              <h2>A little space for the team.</h2>
              <p className="ws-muted">
                <LockKeyhole size={15} />
                Private notes are visible only to the project team.
              </p>
            </div>
            {!readOnly && (
              <Button
                onClick={() =>
                  form(
                    'Add a private note',
                    'Save note',
                    [{ name: 'body', label: 'Private note', type: 'textarea', required: true }],
                    (v) => ({ type: 'note.add', projectId: p.id, id: uid(), body: v.body }),
                  )
                }
              >
                <Plus size={17} />
                Add private note
              </Button>
            )}
          </div>
          <div className="ws-stack">
            {p.internalNotes.map((n) => (
              <section className="ws-card" key={n.id}>
                <p>{n.body}</p>
                <div className="ws-inline">
                  <small>
                    {authorName(n.author)} · {stamp(n.at)}
                  </small>
                  {!readOnly && (
                    <button
                      className="ws-text-button danger"
                      onClick={() =>
                        confirm('Delete this private note?', {
                          type: 'note.delete',
                          projectId: p.id,
                          noteId: n.id,
                        })
                      }
                    >
                      Delete note
                    </button>
                  )}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
      {tab === 'Handover' && (
        <>
          <div className="ws-section-title">
            <div>
              <h2>Ready for what’s next.</h2>
              <p className="ws-muted">
                Only the latest approved work is included in this handover.
              </p>
            </div>
            <Button
              secondary
              onClick={() =>
                download(
                  `${p.id}-handover.json`,
                  JSON.stringify(
                    {
                      id: p.id,
                      title: p.title,
                      description: p.description,
                      dueDate: p.dueDate,
                      milestones: p.milestones,
                      changes: p.changes,
                      deadlineProposals: p.deadlineProposals,
                      deliveries: p.deliveries.flatMap((d) => {
                        const v = d.versions.at(-1);
                        return v?.decision?.value === 'approved'
                          ? [{ id: d.id, title: d.title, version: v }]
                          : [];
                      }),
                    },
                    null,
                    2,
                  ),
                )
              }
            >
              <Download size={17} />
              Export handover
            </Button>
          </div>
          {p.deliveries
            .filter((d) => d.versions.at(-1)?.decision?.value === 'approved')
            .map((d) => (
              <section className="ws-card" key={d.id}>
                <p className="ws-eyebrow">APPROVED · VERSION {d.versions.at(-1)?.number}</p>
                <h3>{d.title}</h3>
                <p>{d.versions.at(-1)?.note}</p>
                <FileLinks files={d.versions.at(-1)!.files} token={context.token} />
              </section>
            ))}
          {!p.deliveries.some((d) => d.versions.at(-1)?.decision?.value === 'approved') && (
            <Empty
              title="Your final files will live here."
              text="Approve the latest version of a delivery to include it in the handover."
            />
          )}
          {milestones}
          {owner && props.saveTemplate && (
            <Button secondary onClick={props.saveTemplate}>
              Save project as template
            </Button>
          )}
        </>
      )}
    </div>
  );
}
function DeliveryCard({
  delivery: d,
  projectId,
  client,
  readonly,
  token,
  onCommand,
  openForm,
  publish,
}: {
  delivery: Delivery;
  projectId: string;
  client: boolean;
  readonly: boolean;
  token?: string;
  onCommand: (c: Command) => Promise<boolean>;
  openForm: (s: FormSpec) => void;
  publish: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const v = d.versions.find((v) => v.id === selected) ?? d.versions.at(-1)!;
  const latest = d.versions.at(-1)?.id === v.id;
  const decide = (decision: 'approved' | 'needs_changes') =>
    openForm({
      title: decision === 'approved' ? 'Approve this work?' : 'What should change?',
      submit: decision === 'approved' ? 'Confirm approval' : 'Confirm changes',
      description:
        decision === 'approved'
          ? 'This records your approval of this version.'
          : 'One revision round will be counted for this version.',
      fields: [
        {
          name: 'note',
          label: 'Decision note',
          type: 'textarea',
          required: decision === 'needs_changes',
        },
      ],
      onSubmit: (vls) =>
        onCommand({
          type: 'delivery.decide',
          projectId,
          deliveryId: d.id,
          versionId: v.id,
          decision,
          note: vls.note,
        }),
    });
  return (
    <article className="ws-card ws-delivery">
      <div className="ws-card-heading">
        <div>
          <p className="ws-eyebrow">
            <Paperclip size={14} />
            DELIVERY
          </p>
          <h3>{d.title}</h3>
        </div>
        <label className="ws-version">
          <span>Version</span>
          <select
            aria-label={`Version of ${d.title}`}
            value={v.id}
            onChange={(e) => setSelected(e.target.value)}
          >
            {d.versions.map((version) => (
              <option key={version.id} value={version.id}>
                Version {version.number}
                {d.versions.at(-1)?.id === version.id ? ' · Latest' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="ws-delivery-note">{v.note}</p>
      <FileLinks files={v.files} token={token} />
      <p className="ws-muted">
        Published {stamp(v.publishedAt)} · {authorName(v.publishedBy)}
      </p>
      {v.decision && (
        <div className={`ws-decision ${v.decision.value}`}>
          <span className={`ws-badge ${v.decision.value}`}>
            {v.decision.value === 'needs_changes' ? 'Changes requested' : 'approved'}
          </span>
          <p>{v.decision.note}</p>
          <small>
            {authorName(v.decision.author)} · {stamp(v.decision.at)}
          </small>
        </div>
      )}
      {!latest && (
        <p className="ws-notice">
          This earlier version is read only. Select the latest version for feedback and decisions.
        </p>
      )}
      {!readonly && latest && (
        <div className="ws-actions">
          {client && !v.decision && (
            <>
              <Button onClick={() => decide('approved')}>
                <Check size={17} />
                Approve work
              </Button>
              <Button secondary onClick={() => decide('needs_changes')}>
                Request changes
              </Button>
            </>
          )}
          {!client && (
            <Button onClick={publish}>
              <Plus size={17} />
              Publish new version
            </Button>
          )}
        </div>
      )}
      <div className="ws-feedback">
        <h4>
          <MessageSquare size={16} />
          Feedback on version {v.number}
        </h4>
        {v.comments.map((c) => (
          <div className="ws-comment" key={c.id}>
            <strong>{authorName(c.author)}</strong>
            <p>{c.body}</p>
            <small>{stamp(c.at)}</small>
          </div>
        ))}
        {!v.comments.length && <p className="ws-muted">No feedback yet.</p>}
        {!readonly && latest && (
          <Button
            secondary
            onClick={() =>
              openForm({
                title: `Feedback on ${d.title} · version ${v.number}`,
                submit: 'Post feedback',
                fields: [{ name: 'body', label: 'Feedback', type: 'textarea', required: true }],
                onSubmit: (vls) =>
                  onCommand({
                    type: 'delivery.comment',
                    projectId,
                    deliveryId: d.id,
                    versionId: v.id,
                    id: uid(),
                    body: vls.body,
                  }),
              })
            }
          >
            Add feedback
          </Button>
        )}
      </div>
    </article>
  );
}
export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="ws-empty">
      <span className="ws-empty-icon">
        <Check size={22} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
