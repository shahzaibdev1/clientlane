create or replace function public.accept_member_invite(p_user uuid,p_hash text) returns uuid language plpgsql security definer set search_path=public as $$
declare i member_invites; u auth.users;
begin
 select * into i from member_invites where token_hash=p_hash;
 if not found then raise exception 'Invitation expired or revoked'; end if;
 perform 1 from workspaces where id=i.workspace_id for update;
 select * into i from member_invites where token_hash=p_hash for update;
 if i.revoked_at is not null or i.expires_at<=now() or i.accepted_at is not null then raise exception 'Invitation expired, accepted or revoked'; end if;
 select * into u from auth.users where id=p_user;
 if u.email_confirmed_at is null or lower(u.email)<>lower(i.email) then raise exception 'Confirm the invited email before accepting.'; end if;
 if exists(select 1 from unnest(i.project_ids) as assigned(project_id) where not exists(select 1 from workspaces w,jsonb_array_elements(w.state->'projects') p where w.id=i.workspace_id and p->>'id'=assigned.project_id)) then raise exception 'Assigned project no longer exists'; end if;
 insert into memberships(workspace_id,user_id,email,project_ids) values(i.workspace_id,p_user,i.email,i.project_ids) on conflict(workspace_id,user_id) do update set email=excluded.email,project_ids=excluded.project_ids,revoked_at=null;
 update member_invites set accepted_at=now() where id=i.id;
 return i.workspace_id;
end $$;
revoke all on function public.accept_member_invite(uuid,text) from public,anon,authenticated;
grant execute on function public.accept_member_invite(uuid,text) to service_role;
notify pgrst,'reload schema';
