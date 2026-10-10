create table public.workspaces(id uuid primary key,owner_id uuid not null unique references auth.users(id) on delete cascade,state jsonb not null,version bigint not null default 0,updated_at timestamptz not null default now());
create table public.memberships(workspace_id uuid references public.workspaces(id) on delete cascade,user_id uuid references auth.users(id) on delete cascade,email text not null,project_ids text[] not null default '{}',revoked_at timestamptz,primary key(workspace_id,user_id));
create table public.member_invites(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,email text not null,project_ids text[] not null,token_hash text not null unique,token_cipher text not null,expires_at timestamptz not null,revoked_at timestamptz,accepted_at timestamptz,created_at timestamptz not null default now());
create table public.portal_grants(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,project_id text not null,email text not null,token_hash text not null unique,token_cipher text not null,expires_at timestamptz not null,revoked_at timestamptz,created_at timestamptz not null default now());
create table public.file_registry(path text primary key,workspace_id uuid not null references public.workspaces(id) on delete cascade,project_id text not null,name text not null,size bigint not null,type text not null,uploader_id uuid references auth.users(id) on delete set null,grant_id uuid references public.portal_grants(id),created_at timestamptz not null default now());
create table public.mail_queue(id uuid primary key default gen_random_uuid(),dedupe_key text not null unique,kind text not null,workspace_id uuid not null references public.workspaces(id) on delete cascade,payload jsonb not null,status text not null default 'pending' check(status in ('pending','sending','sent','error','cancelled')),attempts integer not null default 0,lease_until timestamptz,next_attempt_at timestamptz not null default now(),error text,sent_at timestamptz,created_at timestamptz not null default now());
alter table public.workspaces enable row level security;
alter table public.memberships enable row level security;
alter table public.member_invites enable row level security;
alter table public.portal_grants enable row level security;
alter table public.file_registry enable row level security;
alter table public.mail_queue enable row level security;
revoke all on public.workspaces,public.memberships,public.member_invites,public.portal_grants,public.file_registry,public.mail_queue from anon,authenticated;
grant all on public.workspaces,public.memberships,public.member_invites,public.portal_grants,public.file_registry,public.mail_queue to service_role;
create function public.save_workspace(p_workspace uuid,p_version bigint,p_state jsonb,p_user uuid default null,p_grant text default null) returns bigint language plpgsql security definer set search_path=public as $$
declare w workspaces; m memberships; g portal_grants; p jsonb; oldp jsonb;
begin
 select * into w from workspaces where id=p_workspace for update;
 if not found then raise exception 'Workspace access denied'; end if;
 if p_grant is not null then
 select * into g from portal_grants where workspace_id=w.id and token_hash=p_grant and revoked_at is null and expires_at>now();
 if not found then raise exception 'Portal expired or revoked'; end if;
 if p_state-'projects'<>w.state-'projects' then raise exception 'Portal access denied'; end if;
 for p in select value from jsonb_array_elements(p_state->'projects') loop
 select value into oldp from jsonb_array_elements(w.state->'projects') where value->>'id'=p->>'id';
 if oldp is null or (p->>'id'<>g.project_id and p<>oldp) or (p->>'id'=g.project_id and p->'internalNotes'<>oldp->'internalNotes') then raise exception 'Portal scope denied'; end if;
 end loop;
 if jsonb_array_length(p_state->'projects')<>jsonb_array_length(w.state->'projects') then raise exception 'Portal scope denied'; end if;
 elsif p_user is null then raise exception 'Workspace access denied';
 elsif w.owner_id<>p_user then
 select * into m from memberships where workspace_id=w.id and user_id=p_user and revoked_at is null;
 if not found then raise exception 'Workspace access denied'; end if;
 if p_state-'projects'<>w.state-'projects' or jsonb_array_length(p_state->'projects')<>jsonb_array_length(w.state->'projects') then raise exception 'Member scope denied'; end if;
 for p in select value from jsonb_array_elements(p_state->'projects') loop
 select value into oldp from jsonb_array_elements(w.state->'projects') where value->>'id'=p->>'id';
 if oldp is null or (not ((p->>'id')=any(m.project_ids)) and p<>oldp) then raise exception 'Member scope denied'; end if;
 if p->'assigneeId'<>oldp->'assigneeId' or p->'revisionAllowance'<>oldp->'revisionAllowance' or p->'archived'<>oldp->'archived' then raise exception 'Member access denied'; end if;
 end loop;
 end if;
 if w.version<>p_version then raise exception 'Workspace changed. Reload and try again.'; end if;
 if p_state->>'workspaceId'<>w.id::text or octet_length(p_state::text)>10485760 then raise exception 'Invalid workspace'; end if;
 update portal_grants g2 set revoked_at=now() where g2.workspace_id=w.id and g2.revoked_at is null and not exists(select 1 from jsonb_array_elements(p_state->'projects') p2 join jsonb_array_elements(p_state->'clients') c on c->>'id'=p2->>'clientId' where p2->>'id'=g2.project_id and lower(c->>'email')=lower(g2.email));
 update workspaces set state=p_state,version=version+1,updated_at=now() where id=w.id;
 return w.version+1;
end $$;
revoke all on function public.save_workspace(uuid,bigint,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.save_workspace(uuid,bigint,jsonb,uuid,text) to service_role;
create function public.revoke_access(p_workspace uuid,p_owner uuid,p_project text default null,p_member uuid default null) returns void language plpgsql security definer set search_path=public as $$
begin
 perform 1 from workspaces where id=p_workspace and owner_id=p_owner for update;
 if not found then raise exception 'Owner access required'; end if;
 if p_project is not null then update portal_grants set revoked_at=now() where workspace_id=p_workspace and project_id=p_project and revoked_at is null; end if;
 if p_member is not null then update memberships set revoked_at=now() where workspace_id=p_workspace and user_id=p_member; end if;
end $$;
revoke all on function public.revoke_access(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.revoke_access(uuid,uuid,text,uuid) to service_role;
create function public.claim_mail(p_limit integer default 20) returns setof mail_queue language sql security definer set search_path=public as $$
update mail_queue set status='sending',lease_until=now()+interval '5 minutes',attempts=attempts+1 where id in(select id from mail_queue where ((status in('pending','error') and next_attempt_at<=now()) or(status='sending' and lease_until<now())) and attempts<8 order by created_at for update skip locked limit least(p_limit,100)) returning *;
$$;
revoke all on function public.claim_mail(integer) from public,anon,authenticated;
grant execute on function public.claim_mail(integer) to service_role;
insert into storage.buckets(id,name,public,file_size_limit) values('clientlane-private','clientlane-private',false,20971520) on conflict(id) do update set public=false,file_size_limit=20971520;
notify pgrst,'reload schema';
