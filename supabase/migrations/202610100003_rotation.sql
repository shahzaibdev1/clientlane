create unique index portal_one_active on public.portal_grants(workspace_id,project_id) where revoked_at is null;
create function public.rotate_portal_grant(p_workspace uuid,p_owner uuid,p_project text,p_hash text,p_cipher text,p_expires timestamptz) returns uuid language plpgsql security definer set search_path=public as $$
declare w workspaces; p jsonb; email text; grant_id uuid;
begin
 select * into w from workspaces where id=p_workspace and owner_id=p_owner for update;
 if not found then raise exception 'Owner access required'; end if;
 select value into p from jsonb_array_elements(w.state->'projects') where value->>'id'=p_project and value->>'archived'='false';
 if p is null then raise exception 'Choose an active project'; end if;
 select value->>'email' into email from jsonb_array_elements(w.state->'clients') where value->>'id'=p->>'clientId';
 if email is null or p_expires<=now() or p_expires>now()+interval '91 days' then raise exception 'Invalid portal grant'; end if;
 update portal_grants set revoked_at=now() where workspace_id=w.id and project_id=p_project and revoked_at is null;
 insert into portal_grants(workspace_id,project_id,email,token_hash,token_cipher,expires_at) values(w.id,p_project,email,p_hash,p_cipher,p_expires) returning id into grant_id;
 return grant_id;
end $$;
revoke all on function public.rotate_portal_grant(uuid,uuid,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.rotate_portal_grant(uuid,uuid,text,text,text,timestamptz) to service_role;
notify pgrst,'reload schema';
