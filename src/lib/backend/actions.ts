'use server';
import { z } from 'zod';
import type { Command } from '../domain';
import { createBackend, requireUser } from '../supabase/server';
import { Mail } from './mail';
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
async function result<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof z.ZodError
          ? 'Check the form fields and try again.'
          : error instanceof Error
            ? error.message
            : 'Something went wrong. Try again.',
    };
  }
}
export async function loadWorkspace(workspaceId?: string) {
  return result(async () => createBackend().loadWorkspace((await requireUser()).id, workspaceId));
}
export async function mutateWorkspace(input: {
  workspaceId?: string;
  version: number;
  command: Command;
}) {
  return result(async () => createBackend().mutateWorkspace((await requireUser()).id, input));
}
export async function loadSample(input: {
  workspaceId?: string;
  version: number;
  replace?: boolean;
}) {
  return result(async () => createBackend().loadSample((await requireUser()).id, input));
}
export async function loadPortal(token: string) {
  return result(async () => createBackend().loadPortal(token));
}
export async function mutatePortal(token: string, input: { version: number; command: Command }) {
  return result(async () => createBackend().mutatePortal(token, input));
}
export async function createPortalLink(input: {
  workspaceId: string;
  projectId: string;
  expiryDays?: number;
}) {
  return result(async () =>
    createBackend().createPortalLink(
      (await requireUser()).id,
      input.workspaceId,
      input.projectId,
      input.expiryDays,
    ),
  );
}
export async function revokePortal(input: { workspaceId: string; projectId: string }) {
  return result(async () => {
    await createBackend().revokePortal(
      (await requireUser()).id,
      input.workspaceId,
      input.projectId,
    );
    return { revoked: true };
  });
}
export async function sendPortalInvite(input: { workspaceId: string; projectId: string }) {
  return result(async () => {
    const mail = new Mail(createBackend()),
      queued = await mail.sendPortalInvite(
        (await requireUser()).id,
        input.workspaceId,
        input.projectId,
      );
    await mail.run();
    return mail.status(queued.id);
  });
}
export async function inviteMember(input: {
  workspaceId: string;
  email: string;
  projectIds: string[];
}) {
  return result(async () => {
    const mail = new Mail(createBackend()),
      invite = await mail.inviteMember(
        (await requireUser()).id,
        input.workspaceId,
        input.email,
        input.projectIds,
      );
    await mail.run();
    const status = await mail.status(invite.id);
    return {
      invitationId: invite.invitationId,
      url: invite.url,
      expiresAt: invite.expiresAt,
      ...status,
    };
  });
}
export async function acceptMemberInvite(token: string) {
  return result(async () =>
    new Mail(createBackend()).acceptMemberInvite((await requireUser()).id, token),
  );
}
export async function revokeMember(input: { workspaceId: string; memberId: string }) {
  return result(async () => {
    await createBackend().revokeMember((await requireUser()).id, input.workspaceId, input.memberId);
    return { revoked: true };
  });
}
export async function revokeMemberInvite(input: { workspaceId: string; invitationId: string }) {
  return result(async () => {
    await new Mail(createBackend()).revokeMemberInvite(
      (await requireUser()).id,
      input.workspaceId,
      input.invitationId,
    );
    return { revoked: true };
  });
}
export async function listMembers(workspaceId: string) {
  return result(async () => createBackend().listMembers((await requireUser()).id, workspaceId));
}
export async function retryEmail(input: { workspaceId: string; queueId: string }) {
  return result(async () =>
    new Mail(createBackend()).retryEmail(
      (await requireUser()).id,
      input.workspaceId,
      input.queueId,
    ),
  );
}
export async function listEmailQueue(workspaceId: string) {
  return result(async () =>
    new Mail(createBackend()).listEmailQueue((await requireUser()).id, workspaceId),
  );
}
