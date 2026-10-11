-- Authenticated client relationships are independent of bearer links and team membership.
create table public.client_project_access (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id text not null,
  client_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique(workspace_id,project_id,user_id)
);
create table public.client_account_invites (
  id uuid primary key default gen_random_uuid(),
  direction text not null check(direction in ('client','provider')),
  sender_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  project_id text,
  client_id text,
  client_email text not null,
  brief jsonb,
  token_hash text not null unique,
  token_cipher text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  declined_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.client_project_access enable row level security;
alter table public.client_account_invites enable row level security;
revoke all on public.client_project_access,public.client_account_invites from public,anon,authenticated;
grant all on public.client_project_access,public.client_account_invites to service_role;
create index client_access_user on public.client_project_access(user_id) where revoked_at is null;
create index client_invite_sender on public.client_account_invites(sender_id);
alter table public.file_registry add column client_access_id uuid references public.client_project_access(id) on delete cascade;
-- Brief invitations have no studio until accepted. Existing jobs keep their workspace FK.
alter table public.mail_queue alter column workspace_id drop not null;

create function public.valid_client_access(p_user uuid,p_workspace uuid,p_project text) returns uuid
language sql security definer set search_path=public as $$
  select a.id from client_project_access a join workspaces w on w.id=a.workspace_id
  join auth.users u on u.id=a.user_id,
  lateral jsonb_array_elements(w.state->'projects') p,
  lateral jsonb_array_elements(w.state->'clients') c
  where a.user_id=p_user and a.workspace_id=p_workspace and a.project_id=p_project
  and a.revoked_at is null and u.email_confirmed_at is not null and lower(u.email)=lower(a.email)
  and p->>'id'=a.project_id and p->>'clientId'=a.client_id and c->>'id'=a.client_id
  and lower(c->>'email')=lower(a.email)
$$;
create function public.prune_client_access() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  update client_project_access a set revoked_at=coalesce(a.revoked_at,now())
  where a.workspace_id=new.id and not exists (
    select 1 from jsonb_array_elements(new.state->'projects') p
    join jsonb_array_elements(new.state->'clients') c on c->>'id'=p->>'clientId'
    where p->>'id'=a.project_id and c->>'id'=a.client_id and lower(c->>'email')=lower(a.email)
  );
  update client_account_invites i set revoked_at=coalesce(i.revoked_at,now())
  where i.workspace_id=new.id and not exists (
    select 1 from jsonb_array_elements(new.state->'projects') p
    join jsonb_array_elements(new.state->'clients') c on c->>'id'=p->>'clientId'
    where p->>'id'=i.project_id and c->>'id'=i.client_id and lower(c->>'email')=lower(i.client_email)
  );
  return new;
end $$;
create trigger client_identity_pruning before update of state on public.workspaces
for each row execute function public.prune_client_access();

create function public.register_client_invite() returns trigger
language plpgsql security definer set search_path=public as $$
declare w workspaces;
begin
  if new.direction='client' then
    select * into w from workspaces where id=new.workspace_id and owner_id=new.sender_id for update;
    if not found then raise exception 'Owner access required'; end if;
    if not exists(select 1 from jsonb_array_elements(w.state->'projects') p
      join jsonb_array_elements(w.state->'clients') c on c->>'id'=p->>'clientId'
      where p->>'id'=new.project_id and c->>'id'=new.client_id
      and lower(c->>'email')=lower(new.email) and lower(new.client_email)=lower(new.email)
      and (p->>'archived')::boolean=false)
    then raise exception 'Client project no longer exists'; end if;
  end if;
  return new;
end $$;
create trigger register_client_invite before insert on public.client_account_invites
for each row execute function public.register_client_invite();

create function public.accept_client_account_invite(p_user uuid,p_hash text,p_workspace uuid default null,p_version bigint default null,p_state jsonb default null,p_project text default null,p_client text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare i client_account_invites; w workspaces; u auth.users; client_user uuid;
begin
  select * into u from auth.users where id=p_user;
  if not found or u.email_confirmed_at is null then raise exception 'A confirmed email is required'; end if;
  select * into i from client_account_invites where token_hash=p_hash;
  if not found then raise exception 'Invitation expired or revoked'; end if;
  if lower(u.email)<>lower(i.email) then raise exception 'Sign in with the invited email'; end if;
  -- All paths lock workspace before invitation, matching deletion/revocation/registration.
  select * into w from workspaces where id=case when i.direction='client' or i.accepted_at is not null then i.workspace_id else p_workspace end for update;
  if not found then raise exception 'Project no longer exists'; end if;
  select * into i from client_account_invites where token_hash=p_hash for update;
  if i.revoked_at is not null or i.declined_at is not null or i.expires_at<=now() then raise exception 'Invitation expired, declined or revoked'; end if;
  if i.accepted_at is not null then
    client_user := case when i.direction='client' then p_user else i.sender_id end;
    if i.accepted_by<>p_user or valid_client_access(client_user,i.workspace_id,i.project_id) is null then raise exception 'Invitation access revoked'; end if;
    return jsonb_build_object('workspaceId',i.workspace_id,'projectId',i.project_id,'direction',i.direction);
  end if;
  if i.direction='client' then
    if not exists(select 1 from jsonb_array_elements(w.state->'projects') p
      join jsonb_array_elements(w.state->'clients') c on c->>'id'=p->>'clientId'
      where p->>'id'=i.project_id and c->>'id'=i.client_id and lower(c->>'email')=lower(i.email))
    then raise exception 'Client project no longer exists'; end if;
    client_user := p_user;
  else
    if w.owner_id<>p_user then raise exception 'Owner access required'; end if;
    select id into client_user from auth.users where id=i.sender_id and email_confirmed_at is not null and lower(email)=lower(i.client_email);
    if client_user is null then raise exception 'Originating client email is no longer confirmed'; end if;
    -- State is built by the server domain engine from the current locked version.
    perform save_workspace(w.id,p_version,p_state,p_user,null);
    i.workspace_id := w.id; i.project_id := p_project; i.client_id := p_client;
    if not exists(select 1 from jsonb_array_elements(p_state->'projects') p
      join jsonb_array_elements(p_state->'clients') c on c->>'id'=p->>'clientId'
      where p->>'id'=p_project and c->>'id'=p_client and lower(c->>'email')=lower(i.client_email))
    then raise exception 'Invalid accepted brief'; end if;
  end if;
  insert into client_project_access(workspace_id,project_id,client_id,user_id,email)
    values(i.workspace_id,i.project_id,i.client_id,client_user,i.client_email)
    on conflict(workspace_id,project_id,user_id) do update set revoked_at=null,email=excluded.email,client_id=excluded.client_id;
  update client_account_invites set accepted_at=now(),accepted_by=p_user,workspace_id=i.workspace_id,project_id=i.project_id,client_id=i.client_id where id=i.id;
  return jsonb_build_object('workspaceId',i.workspace_id,'projectId',i.project_id,'direction',i.direction);
end $$;

create function public.save_client_project(p_user uuid,p_workspace uuid,p_project text,p_version bigint,p_state jsonb) returns bigint
language plpgsql security definer set search_path=public as $$
declare w workspaces; p jsonb; oldp jsonb;
begin
  select * into w from workspaces where id=p_workspace for update;
  if not found or valid_client_access(p_user,p_workspace,p_project) is null then raise exception 'Client project access denied'; end if;
  if p_state-'projects'<>w.state-'projects' or jsonb_array_length(p_state->'projects')<>jsonb_array_length(w.state->'projects') then raise exception 'Client scope denied'; end if;
  for p in select value from jsonb_array_elements(p_state->'projects') loop
    select value into oldp from jsonb_array_elements(w.state->'projects') where value->>'id'=p->>'id';
    if oldp is null or (p->>'id'<>p_project and p<>oldp)
      or (p->>'id'=p_project and p-'requests'-'deliveries'-'changes'-'deadlineProposals'-'events'-'revisionUsed'-'dueDate'-'status' <> oldp-'requests'-'deliveries'-'changes'-'deadlineProposals'-'events'-'revisionUsed'-'dueDate'-'status')
    then raise exception 'Client scope denied'; end if;
  end loop;
  return save_workspace(w.id,p_version,p_state,w.owner_id,null);
end $$;

create function public.revoke_client_project(p_owner uuid,p_workspace uuid,p_project text) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform 1 from workspaces where id=p_workspace and owner_id=p_owner for update;
  if not found then raise exception 'Owner access required'; end if;
  update client_project_access set revoked_at=now() where workspace_id=p_workspace and project_id=p_project and revoked_at is null;
  -- Include accepted brief invitations so replay cannot resurrect access.
  update client_account_invites set revoked_at=now() where workspace_id=p_workspace and project_id=p_project and revoked_at is null;
end $$;

create function public.check_client_file_registration() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.client_access_id is not null then
    perform 1 from workspaces where id=new.workspace_id for update;
    if new.client_access_id is distinct from valid_client_access(new.uploader_id,new.workspace_id,new.project_id) or new.grant_id is not null
    then raise exception 'Client file access denied'; end if;
  end if;
  return new;
end $$;
create trigger client_file_registration before insert on public.file_registry for each row execute function public.check_client_file_registration();

revoke all on function public.valid_client_access(uuid,uuid,text),public.prune_client_access(),public.register_client_invite(),public.accept_client_account_invite(uuid,text,uuid,bigint,jsonb,text,text),public.save_client_project(uuid,uuid,text,bigint,jsonb),public.revoke_client_project(uuid,uuid,text),public.check_client_file_registration() from public,anon,authenticated;
grant execute on function public.valid_client_access(uuid,uuid,text),public.accept_client_account_invite(uuid,text,uuid,bigint,jsonb,text,text),public.save_client_project(uuid,uuid,text,bigint,jsonb),public.revoke_client_project(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
