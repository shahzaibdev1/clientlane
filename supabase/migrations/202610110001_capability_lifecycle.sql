-- Project IDs are capability identities: never recycle them within a workspace.
create table public.project_identities (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id text not null,
  primary key (workspace_id, project_id)
);
alter table public.project_identities enable row level security;
revoke all on public.project_identities from public, anon, authenticated;
grant all on public.project_identities to service_role;

-- Include dangling historical references before invalidating them.
insert into public.project_identities(workspace_id, project_id)
select w.id, p->>'id' from public.workspaces w, jsonb_array_elements(w.state->'projects') p
union select workspace_id, project_id from public.file_registry
union select workspace_id, project_id from public.portal_grants
union select workspace_id, unnest(project_ids) from public.memberships
union select workspace_id, unnest(project_ids) from public.member_invites;

create function public.prune_project_access(p_workspace uuid, p_ids text[]) returns void
language plpgsql security definer set search_path=public as $$
begin
  update memberships m set project_ids=array(
    select id from unnest(m.project_ids) id where id=any(p_ids)
  ) where m.workspace_id=p_workspace and not m.project_ids <@ p_ids;
  -- An invitation issued for deleted work is obsolete, even if some scopes survive.
  update member_invites i set revoked_at=coalesce(i.revoked_at,now()), project_ids=array(
    select id from unnest(i.project_ids) id where id=any(p_ids)
  ) where i.workspace_id=p_workspace and not i.project_ids <@ p_ids;
  update portal_grants set revoked_at=now()
    where workspace_id=p_workspace and revoked_at is null and not project_id=any(p_ids);
  delete from file_registry where workspace_id=p_workspace and not project_id=any(p_ids);
end $$;
revoke all on function public.prune_project_access(uuid,text[]) from public, anon, authenticated;

create function public.enforce_project_identity() returns trigger
language plpgsql security definer set search_path=public as $$
declare p jsonb; oldp jsonb; ids text[];
begin
  for p in select value from jsonb_array_elements(new.state->'projects') loop
    oldp := null;
    if tg_op='UPDATE' then
      select value into oldp from jsonb_array_elements(old.state->'projects') where value->>'id'=p->>'id';
    end if;
    if oldp is null then
      if exists(select 1 from project_identities where workspace_id=new.id and project_id=p->>'id') then
        raise exception 'Project identifier cannot be reused';
      end if;
      insert into project_identities(workspace_id,project_id) values(new.id,p->>'id');
    elsif oldp->>'clientId' is distinct from p->>'clientId' then
      raise exception 'Project identity belongs to its original client';
    end if;
  end loop;
  select coalesce(array_agg(value->>'id'),'{}'::text[]) into ids from jsonb_array_elements(new.state->'projects');
  perform prune_project_access(new.id,ids);
  return new;
end $$;
revoke all on function public.enforce_project_identity() from public, anon, authenticated;
-- AFTER INSERT allows the identity rows to reference their new workspace.
create trigger project_identity_after_insert after insert on public.workspaces
  for each row execute function public.enforce_project_identity();
create trigger project_identity_before_update before update of state on public.workspaces
  for each row execute function public.enforce_project_identity();

-- Migrate obsolete capabilities in the existing local database without replacing data.
do $$ declare w workspaces; ids text[]; begin
  for w in select * from workspaces for update loop
    select coalesce(array_agg(value->>'id'),'{}'::text[]) into ids from jsonb_array_elements(w.state->'projects');
    perform prune_project_access(w.id,ids);
  end loop;
end $$;

-- Serialize new invitation/file registration with deletion and access revocation.
create function public.check_project_registration() returns trigger
language plpgsql security definer set search_path=public as $$
declare w workspaces; ids text[];
begin
  select * into w from workspaces where id=new.workspace_id for update;
  if not found then raise exception 'Workspace access denied'; end if;
  if tg_table_name='member_invites' then ids := new.project_ids;
  else ids := array[new.project_id]; end if;
  if cardinality(ids)=0 or exists (
    select 1 from unnest(ids) id where not exists (
      select 1 from jsonb_array_elements(w.state->'projects') p where p->>'id'=id
    )
  ) then raise exception 'Assigned project no longer exists'; end if;
  return new;
end $$;
revoke all on function public.check_project_registration() from public, anon, authenticated;
create trigger invite_project_registration before insert on public.member_invites
  for each row execute function public.check_project_registration();
create trigger file_project_registration before insert on public.file_registry
  for each row execute function public.check_project_registration();

create or replace function public.revoke_access(p_workspace uuid,p_owner uuid,p_project text default null,p_member uuid default null)
returns void language plpgsql security definer set search_path=public as $$
declare member_email text; user_email text;
begin
  perform 1 from workspaces where id=p_workspace and owner_id=p_owner for update;
  if not found then raise exception 'Owner access required'; end if;
  if p_project is not null then
    update portal_grants set revoked_at=now() where workspace_id=p_workspace and project_id=p_project and revoked_at is null;
  end if;
  if p_member is not null then
    update memberships set revoked_at=now() where workspace_id=p_workspace and user_id=p_member returning email into member_email;
    select email into user_email from auth.users where id=p_member;
    update member_invites set revoked_at=now()
      where workspace_id=p_workspace and accepted_at is null and revoked_at is null
      and (lower(email)=lower(member_email) or lower(email)=lower(user_email));
  end if;
end $$;
revoke all on function public.revoke_access(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.revoke_access(uuid,uuid,text,uuid) to service_role;
notify pgrst,'reload schema';
