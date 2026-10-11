-- Removing an account/capability must not remove files retained by a provider's project.
alter table public.file_registry drop constraint file_registry_client_access_id_fkey;
alter table public.file_registry add constraint file_registry_client_access_id_fkey
  foreign key(client_access_id) references public.client_project_access(id) on delete set null;

-- A single SQL statement binds capability, Auth identity and returned workspace data
-- to the same MVCC snapshot. No newer row is fetched after an older authorization.
create function public.read_client_project(p_user uuid,p_workspace uuid,p_project text) returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object('row',to_jsonb(w),'accessId',a.id)
  from client_project_access a join workspaces w on w.id=a.workspace_id
  join auth.users u on u.id=a.user_id,
  lateral jsonb_array_elements(w.state->'projects') p,
  lateral jsonb_array_elements(w.state->'clients') c
  where a.user_id=p_user and a.workspace_id=p_workspace and a.project_id=p_project
  and a.revoked_at is null and u.email_confirmed_at is not null and lower(u.email)=lower(a.email)
  and p->>'id'=a.project_id and p->>'clientId'=a.client_id and c->>'id'=a.client_id
  and lower(c->>'email')=lower(a.email)
$$;

-- Recipient preview is also one authorized snapshot. Return only the public
-- invitation fields, and never follow an eligibility read with a newer workspace.
create function public.read_client_account_invite(p_user uuid,p_hash text) returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'id',i.id,'direction',i.direction,'email',i.email,'workspaceId',i.workspace_id,'projectId',i.project_id,
    'title',case when i.direction='client' then p.value->>'title' else i.brief->>'title' end,
    'description',case when i.direction='client' then p.value->>'description' else i.brief->>'description' end,
    'dueDate',case when i.direction='client' then p.value->>'dueDate' else i.brief->>'dueDate' end,
    'expiresAt',i.expires_at,'status',case when i.accepted_at is null then 'pending' else 'accepted' end
  )
  from client_account_invites i
  join auth.users u on u.id=p_user and u.email_confirmed_at is not null and lower(u.email)=lower(i.email)
  left join auth.users sender on sender.id=i.sender_id
  left join workspaces w on w.id=i.workspace_id
  left join lateral jsonb_array_elements(w.state->'projects') p(value) on p.value->>'id'=i.project_id
  left join lateral jsonb_array_elements(w.state->'clients') c(value) on c.value->>'id'=i.client_id
  left join client_project_access a on a.workspace_id=i.workspace_id and a.project_id=i.project_id
    and a.user_id=case when i.direction='client' then p_user else i.sender_id end
    and a.client_id=i.client_id and lower(a.email)=lower(i.client_email) and a.revoked_at is null
  where i.token_hash=p_hash and i.revoked_at is null and i.declined_at is null and i.expires_at>now()
  and (i.direction='provider' and sender.email_confirmed_at is not null and lower(sender.email)=lower(i.client_email)
    or i.direction='client' and w.owner_id=i.sender_id and p.value->>'clientId'=i.client_id and lower(c.value->>'email')=lower(i.client_email))
  and (i.accepted_at is null or i.accepted_by=p_user and a.id is not null)
$$;
revoke all on function public.read_client_project(uuid,uuid,text),public.read_client_account_invite(uuid,text) from public,anon,authenticated;
grant execute on function public.read_client_project(uuid,uuid,text),public.read_client_account_invite(uuid,text) to service_role;
notify pgrst,'reload schema';
