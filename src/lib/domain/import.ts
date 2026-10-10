import { importRowSchema, LIMITS, workspaceSchema } from './schema';
import type { CsvPreview, WorkspaceState } from './types';

const columns = [
  'title',
  'clientName',
  'clientEmail',
  'company',
  'description',
  'dueDate',
  'revisionAllowance',
] as const;
function readCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let closed = false;
  const pushCell = () => {
    row.push(cell);
    cell = '';
    closed = false;
  };
  const pushRow = () => {
    pushCell();
    if (row.some((value) => value.trim())) rows.push(row);
    row = [];
  };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += char;
      continue;
    }
    if (char === '"') {
      if (cell || closed) throw new Error('A quote must begin a CSV field');
      quoted = true;
    } else if (char === ',') pushCell();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      pushRow();
    } else {
      if (closed) {
        if (char === ' ' || char === '\t') continue;
        throw new Error('Unexpected text after a quoted field');
      }
      cell += char;
    }
  }
  if (quoted) throw new Error('A quoted CSV field is not closed');
  if (cell || row.length || closed) pushRow();
  return rows;
}
/** Preview is all-or-nothing: never import a partial success while concealing invalid rows. */
export function parseProjectsCsv(text: string): CsvPreview {
  const errors: CsvPreview['errors'] = [];
  const preview: CsvPreview['rows'] = [];
  if (new TextEncoder().encode(text).byteLength > LIMITS.stateBytes)
    return { rows: [], errors: [{ row: 0, message: 'CSV is larger than 10MB' }] };
  let raw: string[][];
  try {
    raw = readCsv(text.replace(/^\uFEFF/, ''));
  } catch (error) {
    return {
      rows: [],
      errors: [{ row: 0, message: error instanceof Error ? error.message : 'Invalid CSV' }],
    };
  }
  if (raw.length < 2)
    return { rows: [], errors: [{ row: 1, message: 'Include a header and at least one project' }] };
  const headers = raw[0].map((value) => value.trim());
  const allowed: string[] = [...columns, 'status', 'archived'];
  if (
    new Set(headers).size !== headers.length ||
    headers.some((header) => !allowed.includes(header)) ||
    columns.some((column) => column !== 'company' && !headers.includes(column))
  )
    return {
      rows: [],
      errors: [
        {
          row: 1,
          message:
            'Use title, clientName, clientEmail, company, description, dueDate, revisionAllowance headers',
        },
      ],
    };
  if (raw.length - 1 > LIMITS.projects)
    return { rows: [], errors: [{ row: 0, message: 'Import no more than 500 projects' }] };
  const seen = new Set<string>();
  const identities = new Map<string, string>();
  raw.slice(1).forEach((cells, index) => {
    const line = index + 2;
    if (cells.length !== headers.length) {
      errors.push({ row: line, message: 'Number of fields does not match the header' });
      return;
    }
    const record = Object.fromEntries(headers.map((header, i) => [header, cells[i]]));
    const revision = record.revisionAllowance?.trim();
    if (!/^\d+$/.test(revision)) {
      errors.push({
        row: line,
        message: 'revisionAllowance must be a whole number from 0 to 1000',
      });
      return;
    }
    if (
      record.status !== undefined &&
      !['active', 'waiting', 'review', 'completed'].includes(record.status)
    ) {
      errors.push({ row: line, message: 'Invalid project status' });
      return;
    }
    if (record.archived !== undefined && !['true', 'false'].includes(record.archived)) {
      errors.push({ row: line, message: 'archived must be true or false' });
      return;
    }
    const parsed = importRowSchema.safeParse({
      title: record.title,
      clientName: record.clientName,
      clientEmail: record.clientEmail?.trim(),
      company: record.company ?? '',
      description: record.description,
      dueDate: record.dueDate?.trim() || null,
      revisionAllowance: Number(revision),
      ...(record.status !== undefined ? { status: record.status } : {}),
      ...(record.archived !== undefined ? { archived: record.archived === 'true' } : {}),
    });
    if (!parsed.success) {
      errors.push({
        row: line,
        message: parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; '),
      });
      return;
    }
    const key = `${parsed.data.clientEmail.toLowerCase()}\u0000${parsed.data.title.toLowerCase()}`;
    const email = parsed.data.clientEmail.toLowerCase();
    const identity = JSON.stringify([parsed.data.clientName, parsed.data.company]);
    if (identities.has(email) && identities.get(email) !== identity) {
      errors.push({
        row: line,
        message: 'The same client email has contradictory names or companies',
      });
      return;
    }
    identities.set(email, identity);
    if (seen.has(key)) {
      errors.push({ row: line, message: 'Duplicate project for this client' });
      return;
    }
    seen.add(key);
    preview.push(parsed.data);
  });
  return { rows: errors.length ? [] : preview, errors };
}
function cell(value: unknown): string {
  let safe = String(value ?? '');
  if (/^[\s]*[=+\-@\t\r]/.test(safe)) safe = `'${safe}`;
  return `"${safe.replace(/"/g, '""')}"`;
}
export function exportProjectsCsv(input: WorkspaceState): string {
  const state = workspaceSchema.parse(input);
  const rows = state.projects.map((project) => {
    const client = state.clients.find((c) => c.id === project.clientId)!;
    return [
      project.title,
      client.name,
      client.email,
      client.company,
      project.description,
      project.dueDate,
      project.revisionAllowance,
      project.status,
      project.archived,
    ]
      .map(cell)
      .join(',');
  });
  return [...columns, 'status', 'archived'].join(',') + '\r\n' + rows.join('\r\n');
}
export function exportWorkspaceJson(state: WorkspaceState): string {
  return JSON.stringify(workspaceSchema.parse(state), null, 2);
}
