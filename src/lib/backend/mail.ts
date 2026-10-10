import type { Backend } from './service';
import { check, dbError } from './service';
import { decryptToken, encryptToken, hashToken, newToken } from './crypto';
import { addDays, reminderEligible, weeklyDigest } from '../domain';
import nodemailer from 'nodemailer';
import { z } from 'zod';
type Queue = {
  id: string;
  kind: string;
  workspace_id: string;
  payload: {
    grantId?: string;
    inviteId?: string;
    projectId?: string;
    requestId?: string;
    date?: string;
    clientId?: string;
    grantIds?: string[];
  };
  attempts: number;
};
function transport() {
  check(
    process.env.SMTP_HOST && process.env.SMTP_FROM,
    'Email is not configured. Configure SMTP before sending invitations.',
  );
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  });
}
function link(token: string, path = 'portal') {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  check(url && /^https?:\/\//.test(url), 'Configure the application URL before sending email.');
  return `${url}/${path}/${token}`;
}
export class Mail {
  constructor(public backend: Backend) {}
  async queue(workspaceId: string, key: string, kind: string, payload: Queue['payload']) {
    const result = await this.backend.db
      .from('mail_queue')
      .upsert(
        { workspace_id: workspaceId, dedupe_key: key, kind, payload },
        { onConflict: 'dedupe_key', ignoreDuplicates: true },
      );
    dbError(result.error);
    const row = await this.backend.db
      .from('mail_queue')
      .select('id,status,error')
      .eq('dedupe_key', key)
      .single();
    dbError(row.error);
    return row.data! as { id: string; status: string; error: string | null };
  }
  async inviteMember(user: string, workspaceId: string, email: string, projectIds: string[]) {
    transport();
    const row = await this.backend.owned(user, workspaceId);
    email = z.email().max(254).parse(email).toLowerCase();
    projectIds = z.array(z.string()).min(1).max(500).parse(projectIds);
    check(
      projectIds.every((id) => row.state.projects.some((p) => p.id === id)),
      'Choose existing projects.',
    );
    const token = newToken(),
      expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    const inserted = await this.backend.db
      .from('member_invites')
      .insert({
        workspace_id: workspaceId,
        email,
        project_ids: [...new Set(projectIds)],
        token_hash: hashToken(token),
        token_cipher: encryptToken(token),
        expires_at: expiresAt,
      })
      .select('id')
      .single();
    dbError(inserted.error);
    const queued = await this.queue(workspaceId, `member:${inserted.data!.id}`, 'member', {
      inviteId: inserted.data!.id,
    });
    return {
      ...queued,
      invitationId: inserted.data!.id,
      token,
      url: link(token, 'app/invite'),
      expiresAt,
    };
  }
  async acceptMemberInvite(user: string, token: string) {
    check(/^[A-Za-z0-9_-]{43}$/.test(token), 'Invitation expired or revoked');
    const result = await this.backend.db.rpc('accept_member_invite', {
      p_user: user,
      p_hash: hashToken(token),
    });
    dbError(result.error);
    return { workspaceId: String(result.data) };
  }
  async revokeMemberInvite(user: string, workspaceId: string, id: string) {
    await this.backend.owned(user, workspaceId);
    const r = await this.backend.db
      .from('member_invites')
      .update({ revoked_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)
      .eq('id', id)
      .is('accepted_at', null);
    dbError(r.error);
  }
  async activeGrants(workspaceId: string) {
    const r = await this.backend.db
      .from('portal_grants')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString());
    dbError(r.error);
    return r.data ?? [];
  }
  async sendPortalInvite(user: string, workspaceId: string, projectId: string) {
    transport();
    await this.backend.owned(user, workspaceId);
    let grant = (await this.activeGrants(workspaceId)).find((g) => g.project_id === projectId);
    if (!grant) {
      const created = await this.backend.createPortalLink(user, workspaceId, projectId);
      grant = (await this.backend.grant(created.token)).grant;
    }
    return this.queue(workspaceId, `portal:${grant.id}`, 'portal', {
      grantId: grant.id,
      projectId,
    });
  }
  async schedule(date = new Date().toISOString().slice(0, 10)) {
    const rows = await this.backend.db.from('workspaces').select('id');
    dbError(rows.error);
    let queued = 0;
    for (const w of rows.data ?? []) {
      const row = await this.backend.row(w.id),
        grants = await this.activeGrants(w.id);
      for (const project of row.state.projects) {
        const grant = grants.find((g) => g.project_id === project.id);
        if (!grant) continue;
        for (const request of project.requests)
          if (reminderEligible(project, request, date, true)) {
            await this.queue(
              w.id,
              `reminder:${w.id}:${project.id}:${request.id}:${request.reminder!.nextDueDate}:${grant.id}`,
              'reminder',
              { grantId: grant.id, projectId: project.id, requestId: request.id, date },
            );
            queued++;
          }
      }
      const instant = new Date(`${date}T00:00:00Z`);
      instant.setUTCDate(instant.getUTCDate() - ((instant.getUTCDay() + 6) % 7));
      const week = instant.toISOString().slice(0, 10);
      for (const digest of weeklyDigest(
        row.state,
        date,
        grants.map((g) => g.project_id),
      )) {
        await this.queue(w.id, `digest:${w.id}:${digest.clientId}:${week}`, 'digest', {
          clientId: digest.clientId,
          grantIds: grants
            .filter((g) => digest.projects.some((p) => p.projectId === g.project_id))
            .map((g) => g.id),
          date,
        });
        queued++;
      }
    }
    return { queued };
  }
  async content(job: Queue) {
    const row = await this.backend.row(job.workspace_id);
    if (job.kind === 'member') {
      const { data, error } = await this.backend.db
        .from('member_invites')
        .select('*')
        .eq('id', job.payload.inviteId)
        .eq('workspace_id', row.id)
        .is('revoked_at', null)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      dbError(error);
      if (!data) return null;
      return {
        to: data.email,
        subject: `Join ${row.state.settings.brandName} on Clientlane`,
        text: `You have been invited to work on assigned projects. Sign in with ${data.email} and accept this invitation:\n${link(decryptToken(data.token_cipher), 'app/invite')}\nThis invitation expires ${data.expires_at}.`,
      };
    }
    const grants = await this.activeGrants(row.id);
    if (job.kind === 'digest') {
      if (!row.state.settings.weeklyDigest) return null;
      const allowed = grants.filter((g) => job.payload.grantIds?.includes(g.id));
      const digest = weeklyDigest(
        row.state,
        new Date().toISOString().slice(0, 10),
        allowed.map((g) => g.project_id),
      ).find((d) => d.clientId === job.payload.clientId);
      if (!digest) return null;
      return {
        to: digest.email,
        subject: `Your weekly project update from ${row.state.settings.brandName}`,
        text: digest.projects
          .map((p) => {
            const grant = allowed.find((g) => g.project_id === p.projectId)!;
            return `${p.title}\n${p.requests.length} open requests · ${p.deliveries.length} reviews awaiting you\n${link(decryptToken(grant.token_cipher))}`;
          })
          .join('\n\n'),
      };
    }
    const grant = grants.find((g) => g.id === job.payload.grantId);
    if (!grant) return null;
    const project = row.state.projects.find((p) => p.id === grant.project_id);
    if (!project || project.archived) return null;
    const client = row.state.clients.find((c) => c.id === project.clientId);
    if (!client || client.email.toLowerCase() !== grant.email.toLowerCase()) return null;
    if (job.kind === 'reminder') {
      const request = project.requests.find((r) => r.id === job.payload.requestId);
      if (
        !request ||
        !reminderEligible(project, request, new Date().toISOString().slice(0, 10), true)
      )
        return null;
      return {
        to: grant.email,
        subject: `A quick reminder: ${request.title}`,
        text: `${project.title}\nPlease share: ${request.title}\n${request.instructions}\nOpen your project: ${link(decryptToken(grant.token_cipher))}`,
      };
    }
    return {
      to: grant.email,
      subject: `Your project portal: ${project.title}`,
      text: `Hello ${client.name},\nYour project updates, requests and reviews are here:\n${link(decryptToken(grant.token_cipher))}\nThe link expires ${grant.expires_at}.`,
    };
  }
  async advance(job: Queue) {
    if (job.kind !== 'reminder') return;
    if (!(await this.activeGrants(job.workspace_id)).some((g) => g.id === job.payload.grantId))
      return;
    for (let retry = 0; retry < 3; retry++) {
      const row = await this.backend.row(job.workspace_id),
        project = row.state.projects.find((p) => p.id === job.payload.projectId),
        request = project?.requests.find((r) => r.id === job.payload.requestId);
      if (
        !request?.reminder ||
        !project ||
        !reminderEligible(project, request, new Date().toISOString().slice(0, 10), true)
      )
        return;
      try {
        await this.backend.mutateWorkspace(row.owner_id, {
          workspaceId: row.id,
          version: row.version,
          command: {
            type: 'request.reminder.advance',
            projectId: project.id,
            requestId: request.id,
            nextDueDate: addDays(
              new Date().toISOString().slice(0, 10),
              request.reminder.intervalDays,
            ),
          },
        });
        return;
      } catch (error) {
        if (retry === 2) throw error;
      }
    }
  }
  async run() {
    const repairs = await this.backend.db
      .from('mail_queue')
      .select('*')
      .eq('status', 'sent')
      .not('error', 'is', null)
      .limit(100);
    dbError(repairs.error);
    for (const job of (repairs.data ?? []) as Queue[]) {
      try {
        await this.advance(job);
        const repaired = await this.backend.db
          .from('mail_queue')
          .update({ error: null })
          .eq('id', job.id)
          .eq('status', 'sent');
        dbError(repaired.error);
      } catch {
        /* Retain the sent record for schedule repair; never re-send. */
      }
    }
    const claimed = await this.backend.db.rpc('claim_mail', { p_limit: 20 });
    dbError(claimed.error);
    const counts = { sent: 0, errors: 0, cancelled: 0 };
    for (const job of (claimed.data ?? []) as Queue[]) {
      try {
        const renewed = await this.backend.db
          .from('mail_queue')
          .update({ lease_until: new Date(Date.now() + 300000).toISOString() })
          .eq('id', job.id)
          .eq('attempts', job.attempts)
          .eq('status', 'sending')
          .select('id');
        dbError(renewed.error);
        if (!renewed.data?.length) continue;
        const content = await this.content(job);
        if (!content) {
          const r = await this.backend.db
            .from('mail_queue')
            .update({ status: 'cancelled', lease_until: null })
            .eq('id', job.id)
            .eq('attempts', job.attempts);
          dbError(r.error);
          counts.cancelled++;
          continue;
        }
        const result = await transport().sendMail({ from: process.env.SMTP_FROM, ...content });
        check((result.accepted?.length ?? 0) > 0, 'Email transport did not accept the recipient.');
        const r = await this.backend.db
          .from('mail_queue')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            lease_until: null,
            error: null,
          })
          .eq('id', job.id)
          .eq('attempts', job.attempts);
        dbError(r.error);
        counts.sent++;
        // A reminder state-update failure must not re-send an already accepted email.
        try {
          await this.advance(job);
        } catch {
          const r = await this.backend.db
            .from('mail_queue')
            .update({ error: 'Email sent; reminder schedule update requires retry.' })
            .eq('id', job.id);
          dbError(r.error);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Email could not be sent.';
        const r = await this.backend.db
          .from('mail_queue')
          .update({
            status: 'error',
            error: message.slice(0, 500),
            lease_until: null,
            next_attempt_at: new Date(
              Date.now() + Math.min(3600, 30 * 2 ** job.attempts) * 1000,
            ).toISOString(),
          })
          .eq('id', job.id)
          .eq('attempts', job.attempts);
        dbError(r.error);
        counts.errors++;
      }
    }
    return counts;
  }
  async retryEmail(user: string, workspaceId: string, id: string) {
    await this.backend.owned(user, workspaceId);
    transport();
    const retry = await this.backend.db
      .from('mail_queue')
      .update({
        status: 'pending',
        attempts: 0,
        next_attempt_at: new Date().toISOString(),
        error: null,
        lease_until: null,
      })
      .eq('workspace_id', workspaceId)
      .eq('id', id)
      .eq('status', 'error')
      .select('id');
    dbError(retry.error);
    check(retry.data?.length, 'This email is not waiting for retry.');
    await this.run();
    return this.status(id);
  }
  async listEmailQueue(user: string, workspaceId: string) {
    await this.backend.owned(user, workspaceId);
    const r = await this.backend.db
      .from('mail_queue')
      .select('id,kind,status,error,sent_at,created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(100);
    dbError(r.error);
    return (r.data ?? []).map((row) => ({
      ...row,
      error: row.error ? 'Email needs attention. Check email setup and retry.' : null,
    }));
  }
  async status(id: string) {
    const r = await this.backend.db
      .from('mail_queue')
      .select('id,status,error,sent_at')
      .eq('id', id)
      .single();
    dbError(r.error);
    return {
      ...r.data!,
      error: r.data?.error ? 'Email needs attention. Check email setup and retry.' : null,
    } as {
      id: string;
      status: 'pending' | 'sending' | 'sent' | 'error' | 'cancelled';
      error: string | null;
      sent_at: string | null;
    };
  }
}
