'use server';
import { z } from 'zod';
import { createBackend, requireUser } from '../supabase/server';
import { ClientAccounts, type ClientBrief } from './client-accounts';
import { Mail } from './mail';
import type { Command } from '../domain';
import type { Result } from './actions';
async function result<T>(fn: (a: ClientAccounts, user: string) => Promise<T>): Promise<Result<T>> {
  try {
    return {
      ok: true,
      data: await fn(new ClientAccounts(createBackend()), (await requireUser()).id),
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof z.ZodError
          ? 'Check the form fields and try again.'
          : error instanceof Error
            ? error.message
            : 'Unable to continue. Try again.',
    };
  }
}
export async function loadClientDashboard() {
  return result(async (a, user) => ({
    projects: await a.listProjects(user),
    invitations: await a.listInvites(user),
  }));
}
export async function loadClientProject(workspaceId: string, projectId: string) {
  return result((a, user) => a.loadProject(user, workspaceId, projectId));
}
export async function mutateClientProject(
  workspaceId: string,
  projectId: string,
  input: { version: number; command: Command },
) {
  return result((a, user) => a.mutateProject(user, workspaceId, projectId, input));
}
export async function inviteClientAccount(workspaceId: string, projectId: string) {
  return result((a, user) => a.inviteClient(user, workspaceId, projectId));
}
export async function inviteProviderAccount(input: ClientBrief) {
  return result((a, user) => a.inviteProvider(user, input));
}
export async function previewAccountInvite(token: string) {
  return result((a, user) => a.preview(user, token));
}
export async function acceptAccountInvite(token: string) {
  return result((a, user) => a.accept(user, token));
}
export async function declineAccountInvite(token: string) {
  return result(async (a, user) => {
    await a.decline(user, token);
    return true;
  });
}
export async function revokeAccountInvite(id: string) {
  return result(async (a, user) => {
    await a.revokeInvite(user, id);
    return true;
  });
}
export async function revokeClientAccount(workspaceId: string, projectId: string) {
  return result(async (a, user) => {
    await a.revokeAccess(user, workspaceId, projectId);
    return true;
  });
}
export async function listProjectAccountInvites(workspaceId: string, projectId: string) {
  return result((a, user) => a.listInvites(user, workspaceId, projectId));
}
export async function sendAccountInvite(id: string) {
  return result(async (a, user) => {
    const queued = await new Mail(a.backend).sendAccountInvite(user, id);
    await new Mail(a.backend).run();
    return new Mail(a.backend).status(queued.id);
  });
}
