import type { Backend } from './service';
import { check, dbError } from './service';
import { randomUUID } from 'node:crypto';
import { fileRefSchema, portalProject, type Project, type FileRef } from '../domain';
const bucket = 'clientlane-private';
export async function readUpload(request: Request) {
  const limit = 21 * 1024 * 1024;
  check(
    Number(request.headers.get('content-length') ?? 0) <= limit,
    'Files must be no larger than 20MB.',
  );
  check(request.body, 'Choose a file.');
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error('Files must be no larger than 20MB.');
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return new Response(bytes, {
    headers: { 'Content-Type': request.headers.get('content-type') ?? '' },
  }).formData();
}
type FileActor = { userId?: string; token?: string; workspaceId?: string };
function references(project: Pick<Project, 'requests' | 'deliveries'>): FileRef[] {
  return [
    ...project.requests.flatMap((r) => [
      ...(r.response?.files ?? []),
      ...r.responseHistory.flatMap((h) => h.files),
    ]),
    ...project.deliveries.flatMap((d) => d.versions.flatMap((v) => v.files)),
  ];
}
function validContent(type: string, bytes: Buffer) {
  const head = bytes.subarray(0, 64),
    ascii = head.toString('ascii');
  if (type === 'text/plain' || type === 'text/csv') {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return (
      !text.includes(String.fromCharCode(0)) &&
      !/^\s*(?:<!doctype html|<html|<svg|<script)/i.test(text)
    );
  }
  if (type === 'image/png')
    return head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === 'image/jpeg') return head[0] === 255 && head[1] === 216 && head[2] === 255;
  if (type === 'image/gif') return ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a');
  if (type === 'image/webp') return ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP';
  if (type === 'application/pdf') return ascii.startsWith('%PDF-');
  if (type === 'application/zip' || type.includes('openxmlformats'))
    return head[0] === 80 && head[1] === 75 && head[2] === 3 && head[3] === 4;
  if (type === 'audio/mpeg')
    return ascii.startsWith('ID3') || (head[0] === 255 && (head[1] & 224) === 224);
  if (type === 'audio/wav') return ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WAVE';
  if (type === 'video/mp4') return ascii.slice(4, 8) === 'ftyp';
  if (type === 'video/webm') return head.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]));
  return false;
}
export class Files {
  constructor(public backend: Backend) {}
  async access(actor: FileActor, projectId: string, workspaceId?: string) {
    if (actor.token) {
      const { grant, row } = await this.backend.grant(actor.token);
      check(
        grant.project_id === projectId && (!workspaceId || row.id === workspaceId),
        'File access denied',
      );
      return { row, grant };
    }
    check(actor.userId, 'Sign in to access files.');
    const view = await this.backend.loadWorkspace(actor.userId, workspaceId ?? actor.workspaceId);
    check(view.projectIds.includes(projectId), 'File access denied');
    return { row: await this.backend.row(view.state.workspaceId), grant: null };
  }
  async upload(actor: FileActor, projectId: string, file: File) {
    check(
      !/\.(html?|svg|js|mjs|exe|com|bat|cmd|ps1|scr|msi|vbs|sh|bash|zsh|fish|py|rb|pl|php|jar|class|dll|lnk|url|hta|reg|cpl|app|dmg|iso|wsf|wsh|vb|vbe|jse|jsx|tsx)$/i.test(
        file.name.trim().replace(/[ .]+$/g, ''),
      ),
      'Unsupported file name.',
    );
    const { row, grant } = await this.access(actor, projectId),
      project = row.state.projects.find((p) => p.id === projectId);
    check(project && !project.archived, 'Choose an active project.');
    const parsed = fileRefSchema.parse({
      kind: 'upload',
      path: `${row.id}/${projectId}/${randomUUID()}`,
      name: file.name,
      size: file.size,
      type: file.type,
    });
    check(parsed.kind === 'upload', 'Invalid file type');
    const bytes = Buffer.from(await file.arrayBuffer());
    check(validContent(parsed.type, bytes), 'File content does not match its type.');
    const stored = await this.backend.db.storage
      .from(bucket)
      .upload(parsed.path, bytes, { contentType: parsed.type, upsert: false });
    dbError(stored.error);
    const registry = await this.backend.db.from('file_registry').insert({
      path: parsed.path,
      workspace_id: row.id,
      project_id: projectId,
      name: parsed.name,
      size: parsed.size,
      type: parsed.type,
      uploader_id: actor.userId ?? null,
      grant_id: grant?.id ?? null,
    });
    if (registry.error) {
      await this.backend.db.storage.from(bucket).remove([parsed.path]);
      dbError(registry.error);
    }
    return parsed;
  }
  async metadata(actor: FileActor, path: string) {
    check(/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(path), 'File access denied');
    const { data, error } = await this.backend.db
      .from('file_registry')
      .select('*')
      .eq('path', path)
      .maybeSingle();
    dbError(error);
    check(data, 'File was not found.');
    const { row, grant } = await this.access(actor, data.project_id, data.workspace_id),
      project = row.state.projects.find((p) => p.id === data.project_id);
    check(project, 'File access denied');
    if (grant)
      check(
        references(portalProject(project)).some((f) => f.kind === 'upload' && f.path === path),
        'File is not public in this portal.',
      );
    return data as { path: string; name: string; type: string; size: number };
  }
  async download(actor: FileActor, path: string) {
    await this.metadata(actor, path);
    const { data, error } = await this.backend.db.storage.from(bucket).download(path);
    dbError(error);
    check(data, 'File was not found.');
    return data;
  }
}
