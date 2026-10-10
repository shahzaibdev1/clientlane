import { z } from 'zod';

export const LIMITS = {
  clients: 200,
  projects: 500,
  requests: 200,
  deliveries: 100,
  versions: 50,
  comments: 200,
  events: 500,
  stateBytes: 10 * 1024 * 1024,
  fileBytes: 20 * 1024 * 1024,
} as const;
export const idSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9_-]+$/, 'Use a safe identifier');
const title = z.string().trim().min(1).max(200);
const text = z.string().max(10000);
const body = z.string().trim().min(1).max(10000);
const integer = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value &&
      value >= '1900-01-01' &&
      value <= '9999-12-31'
    );
  }, 'Enter a valid calendar date');
export const timestampSchema = z.iso.datetime();
export const currencySchema = z.enum(['USD', 'EUR', 'GBP', 'PKR', 'CAD', 'AUD']);
export const httpsSchema = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'Use an HTTPS link without credentials');
export const UPLOAD_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'audio/mpeg',
  'audio/wav',
  'video/mp4',
  'video/webm',
] as const;
const safeFileName = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine(
    (value) =>
      !/[\\/]/.test(value) &&
      !Array.from(value).some((character) => character.charCodeAt(0) < 32) &&
      !/\.(html?|svg|js|mjs|exe|com|bat|cmd|ps1|scr|msi|vbs)$/i.test(value),
    'Unsupported file name',
  );
export const fileRefSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('upload'),
    path: z
      .string()
      .max(1024)
      .refine(
        (value) =>
          /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9._/-]+$/.test(value) &&
          value
            .split('/')
            .every((segment) => segment !== '.' && segment !== '..' && segment.length > 0),
        'Invalid private file path',
      ),
    name: safeFileName,
    size: integer.max(LIMITS.fileBytes).min(1),
    type: z.enum(UPLOAD_TYPES),
  }),
  z.strictObject({ kind: z.literal('link'), url: httpsSchema, name: title }),
]);
const files = z.array(fileRefSchema).max(50);
export const settingsSchema = z.strictObject({
  brandName: title,
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  logoUrl: httpsSchema.nullable(),
  currency: currencySchema,
  weeklyDigest: z.boolean(),
});
export const clientSchema = z.strictObject({
  id: idSchema,
  name: title,
  email: z.email().max(254),
  company: z.string().max(200),
});
export const reminderSchema = z.strictObject({
  enabled: z.boolean(),
  intervalDays: z.number().int().min(1).max(90),
  nextDueDate: dateSchema,
});
const responseSchema = z
  .strictObject({ text, files, author: title, submittedAt: timestampSchema })
  .refine(
    (response) => response.text.trim().length > 0 || response.files.length > 0,
    'A response needs meaningful text or a file',
  );
export const requestSchema = z
  .strictObject({
    id: idSchema,
    title,
    instructions: text,
    requestType: z.enum(['text', 'file']),
    dueDate: dateSchema.nullable(),
    status: z.enum(['pending', 'received', 'rejected']),
    reminder: reminderSchema.nullable(),
    response: responseSchema.nullable(),
    responseHistory: z.array(responseSchema).max(50),
    rejectionReason: text.nullable(),
  })
  .superRefine((r, ctx) => {
    if (r.status === 'received' && !r.response)
      ctx.addIssue({ code: 'custom', message: 'Received request needs a response' });
    if (r.status === 'received' && r.requestType === 'file' && !r.response?.files.length)
      ctx.addIssue({ code: 'custom', message: 'File request needs a file response' });
    if (r.status === 'rejected' && !r.rejectionReason?.trim())
      ctx.addIssue({ code: 'custom', message: 'Rejected request needs a reason' });
  });
const commentSchema = z.strictObject({ id: idSchema, body, author: title, at: timestampSchema });
const decisionSchema = z.strictObject({
  value: z.enum(['approved', 'needs_changes']),
  note: text,
  author: title,
  at: timestampSchema,
});
export const versionSchema = z.strictObject({
  id: idSchema,
  number: z.number().int().min(1).max(50),
  note: text,
  files,
  publishedAt: timestampSchema,
  publishedBy: title,
  comments: z.array(commentSchema).max(LIMITS.comments),
  decision: decisionSchema.nullable(),
});
export const deliverySchema = z.strictObject({
  id: idSchema,
  title,
  versions: z.array(versionSchema).min(1).max(LIMITS.versions),
});
const agreementResponse = z.strictObject({ author: title, at: timestampSchema });
const quoteSchema = z.strictObject({
  amountCents: integer,
  currency: currencySchema,
  dueDate: dateSchema.nullable(),
  note: text,
  author: title,
  at: timestampSchema,
});
export const changeSchema = z
  .strictObject({
    id: idSchema,
    title,
    description: body,
    requestedBy: title,
    requestedAt: timestampSchema,
    status: z.enum(['requested', 'quoted', 'accepted', 'rejected']),
    quote: quoteSchema.nullable(),
    response: agreementResponse.nullable(),
  })
  .superRefine((c, ctx) => {
    if (c.status !== 'requested' && !c.quote)
      ctx.addIssue({ code: 'custom', message: 'Quoted change requires a quote' });
    if (['accepted', 'rejected'].includes(c.status) && !c.response)
      ctx.addIssue({ code: 'custom', message: 'Agreement requires a response' });
  });
export const milestoneSchema = z.strictObject({
  id: idSchema,
  title,
  dueDate: dateSchema.nullable(),
  completed: z.boolean(),
});
export const deadlineProposalSchema = z
  .strictObject({
    id: idSchema,
    dueDate: dateSchema,
    previousDueDate: dateSchema.nullable(),
    reason: body,
    proposedBy: title,
    proposedAt: timestampSchema,
    status: z.enum(['pending', 'accepted', 'rejected']),
    response: agreementResponse.nullable(),
  })
  .refine(
    (proposal) =>
      proposal.status === 'pending' ? proposal.response === null : proposal.response !== null,
    'Deadline agreement must include its final response',
  );
export const eventSchema = z.strictObject({
  id: idSchema,
  type: z.string().max(80),
  message: z.string().max(500),
  author: title,
  at: timestampSchema,
  visibility: z.enum(['public', 'internal']),
});
const noteSchema = z.strictObject({ id: idSchema, body, author: title, at: timestampSchema });
export const projectSchema = z.strictObject({
  id: idSchema,
  clientId: idSchema,
  title,
  description: text,
  dueDate: dateSchema.nullable(),
  originalDueDate: dateSchema.nullable(),
  status: z.enum(['active', 'waiting', 'review', 'completed']),
  archived: z.boolean(),
  assigneeId: idSchema.nullable(),
  revisionAllowance: z.number().int().min(0).max(1000),
  revisionUsed: z.number().int().min(0).max(5000),
  createdAt: timestampSchema,
  requests: z.array(requestSchema).max(LIMITS.requests),
  deliveries: z.array(deliverySchema).max(LIMITS.deliveries),
  changes: z.array(changeSchema).max(200),
  milestones: z.array(milestoneSchema).max(200),
  deadlineProposals: z.array(deadlineProposalSchema).max(100),
  events: z.array(eventSchema).max(LIMITS.events),
  internalNotes: z.array(noteSchema).max(200),
});
export const templateSchema = z.strictObject({
  id: idSchema,
  name: title,
  description: text,
  revisionAllowance: z.number().int().min(0).max(1000),
  requests: z
    .array(
      z.strictObject({
        title,
        instructions: text,
        requestType: z.enum(['text', 'file']),
        dueOffsetDays: z.number().int().min(0).max(3650).nullable(),
      }),
    )
    .max(LIMITS.requests),
  milestones: z
    .array(z.strictObject({ title, dueOffsetDays: z.number().int().min(0).max(3650).nullable() }))
    .max(200),
});
export const importRowSchema = z.strictObject({
  title,
  clientName: title,
  clientEmail: z.email().max(254),
  company: z.string().max(200),
  description: text,
  dueDate: dateSchema.nullable(),
  revisionAllowance: z.number().int().min(0).max(1000),
  status: projectSchema.shape.status.optional(),
  archived: z.boolean().optional(),
});
export const workspaceSchema = z
  .strictObject({
    workspaceId: idSchema,
    settings: settingsSchema,
    clients: z.array(clientSchema).max(LIMITS.clients),
    projects: z.array(projectSchema).max(LIMITS.projects),
    templates: z.array(templateSchema).max(100),
  })
  .superRefine((state, ctx) => {
    const problem = (message: string) => ctx.addIssue({ code: 'custom', message });
    const unique = (values: { id: string }[], label: string) => {
      if (new Set(values.map((v) => v.id)).size !== values.length)
        problem(`Duplicate ${label} identifier`);
    };
    unique(state.clients, 'client');
    unique(state.projects, 'project');
    unique(state.templates, 'template');
    for (const p of state.projects) {
      if (!state.clients.some((c) => c.id === p.clientId)) problem('Project client does not exist');
      for (const [items, label] of [
        [p.requests, 'request'],
        [p.deliveries, 'delivery'],
        [p.changes, 'change'],
        [p.milestones, 'milestone'],
        [p.deadlineProposals, 'deadline proposal'],
        [p.events, 'event'],
        [p.internalNotes, 'note'],
      ] as const)
        unique(items, label);
      let used = 0;
      const validateFiles = (refs: z.infer<typeof fileRefSchema>[]) => {
        for (const f of refs)
          if (f.kind === 'upload' && !f.path.startsWith(`${state.workspaceId}/${p.id}/`))
            problem('Private file path is outside its workspace/project');
      };
      for (const r of p.requests) {
        if (r.response) validateFiles(r.response.files);
        for (const response of r.responseHistory) validateFiles(response.files);
      }
      for (const d of p.deliveries) {
        unique(d.versions, 'version');
        d.versions.forEach((v, i) => {
          if (v.number !== i + 1) problem('Delivery version sequence is invalid');
          unique(v.comments, 'comment');
          validateFiles(v.files);
          if (v.decision?.value === 'needs_changes') used++;
        });
      }
      if (used !== p.revisionUsed) problem('Revision count does not match immutable decisions');
    }
    if (new TextEncoder().encode(JSON.stringify(state)).byteLength > LIMITS.stateBytes)
      problem('Workspace is larger than the 10MB state limit');
  });

const projectId = { projectId: idSchema };
const requestId = { ...projectId, requestId: idSchema };
const deliveryId = { ...projectId, deliveryId: idSchema };
const versionId = { ...deliveryId, versionId: idSchema };
const milestoneId = { ...projectId, milestoneId: idSchema };
const editProject = {
  title: title.optional(),
  description: text.optional(),
  clientId: idSchema.optional(),
  dueDate: dateSchema.nullable().optional(),
  status: projectSchema.shape.status.optional(),
  assigneeId: idSchema.nullable().optional(),
  revisionAllowance: projectSchema.shape.revisionAllowance.optional(),
};
const editRequest = {
  title: title.optional(),
  instructions: text.optional(),
  requestType: z.enum(['text', 'file']).optional(),
  dueDate: dateSchema.nullable().optional(),
  reminder: reminderSchema.nullable().optional(),
};
export const commandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('settings.update'), ...settingsSchema.partial().shape }),
  z.strictObject({ type: z.literal('client.create'), ...clientSchema.shape }),
  z.strictObject({
    type: z.literal('client.update'),
    clientId: idSchema,
    name: title.optional(),
    email: z.email().max(254).optional(),
    company: z.string().max(200).optional(),
  }),
  z.strictObject({
    type: z.literal('client.delete'),
    clientId: idSchema,
    confirm: z.literal(true),
  }),
  z.strictObject({
    type: z.literal('project.create'),
    id: idSchema,
    clientId: idSchema,
    title,
    description: text,
    dueDate: dateSchema.nullable(),
    revisionAllowance: projectSchema.shape.revisionAllowance,
    assigneeId: idSchema.nullable().optional(),
    templateId: idSchema.optional(),
  }),
  z.strictObject({ type: z.literal('project.update'), ...projectId, ...editProject }),
  z.strictObject({ type: z.literal('project.archive'), ...projectId, archived: z.boolean() }),
  z.strictObject({ type: z.literal('project.delete'), ...projectId, confirm: z.literal(true) }),
  z.strictObject({
    type: z.literal('request.create'),
    ...projectId,
    id: idSchema,
    title,
    instructions: text,
    requestType: z.enum(['text', 'file']),
    dueDate: dateSchema.nullable(),
    reminder: reminderSchema.nullable().optional(),
  }),
  z.strictObject({ type: z.literal('request.update'), ...requestId, ...editRequest }),
  z.strictObject({ type: z.literal('request.delete'), ...requestId }),
  z.strictObject({ type: z.literal('request.submit'), ...requestId, text, files }),
  z.strictObject({ type: z.literal('request.reject'), ...requestId, reason: body }),
  z.strictObject({ type: z.literal('request.reopen'), ...requestId }),
  z.strictObject({
    type: z.literal('request.reminder.advance'),
    ...requestId,
    nextDueDate: dateSchema,
  }),
  z.strictObject({
    type: z.literal('delivery.publish'),
    ...deliveryId,
    title,
    versionId: idSchema,
    note: text,
    files,
  }),
  z.strictObject({ type: z.literal('delivery.comment'), ...versionId, id: idSchema, body }),
  z.strictObject({
    type: z.literal('delivery.decide'),
    ...versionId,
    decision: z.enum(['approved', 'needs_changes']),
    note: text,
  }),
  z.strictObject({
    type: z.literal('change.request'),
    ...projectId,
    id: idSchema,
    title,
    description: body,
  }),
  z.strictObject({
    type: z.literal('change.quote'),
    ...projectId,
    changeId: idSchema,
    amountCents: integer,
    currency: currencySchema,
    dueDate: dateSchema.nullable(),
    note: text,
  }),
  z.strictObject({
    type: z.literal('change.respond'),
    ...projectId,
    changeId: idSchema,
    accepted: z.boolean(),
  }),
  z.strictObject({
    type: z.literal('deadline.propose'),
    ...projectId,
    id: idSchema,
    dueDate: dateSchema,
    reason: body,
  }),
  z.strictObject({
    type: z.literal('deadline.respond'),
    ...projectId,
    proposalId: idSchema,
    accepted: z.boolean(),
  }),
  z.strictObject({
    type: z.literal('milestone.create'),
    ...projectId,
    id: idSchema,
    title,
    dueDate: dateSchema.nullable(),
  }),
  z.strictObject({
    type: z.literal('milestone.update'),
    ...milestoneId,
    title: title.optional(),
    dueDate: dateSchema.nullable().optional(),
    completed: z.boolean().optional(),
  }),
  z.strictObject({ type: z.literal('milestone.delete'), ...milestoneId }),
  z.strictObject({ type: z.literal('note.add'), ...projectId, id: idSchema, body }),
  z.strictObject({ type: z.literal('note.delete'), ...projectId, noteId: idSchema }),
  z.strictObject({ type: z.literal('template.save'), ...templateSchema.shape }),
  z.strictObject({ type: z.literal('template.delete'), templateId: idSchema }),
  z.strictObject({
    type: z.literal('projects.import'),
    rows: z.array(importRowSchema).min(1).max(LIMITS.projects),
  }),
]);
export const actorSchema = z.discriminatedUnion('role', [
  z.strictObject({ role: z.literal('owner'), id: idSchema }),
  z.strictObject({
    role: z.literal('member'),
    id: idSchema,
    projectIds: z.array(idSchema).max(LIMITS.projects),
  }),
  z.strictObject({ role: z.literal('client'), projectId: idSchema, name: title }),
]);
