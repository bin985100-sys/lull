begin;
-- Provider credentials never appear in the client-readable library tables.
create table if not exists public.lull_google_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_sub text not null,
  access_secret_id uuid not null,
  refresh_secret_id uuid,
  expires_at timestamptz not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.lull_google_connections enable row level security;
revoke all on public.lull_google_connections from public, anon, authenticated;
grant all on public.lull_google_connections to service_role;

create or replace function public.lull_google_connection_get(p_user_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('google_sub',c.google_sub,'access_token',a.decrypted_secret,
    'refresh_token',r.decrypted_secret,'expires_at',c.expires_at,'revision',c.revision)
  from public.lull_google_connections c
  join vault.decrypted_secrets a on a.id=c.access_secret_id
  left join vault.decrypted_secrets r on r.id=c.refresh_secret_id
  where c.user_id=p_user_id;
$$;

create or replace function public.lull_google_connection_save(
  p_user_id uuid, p_google_sub text, p_access_token text, p_refresh_token text,
  p_expires_at timestamptz, p_expected_revision bigint default null
) returns boolean language plpgsql security definer set search_path = '' as $$
declare c public.lull_google_connections; access_id uuid; refresh_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,3917));
  select * into c from public.lull_google_connections where user_id=p_user_id for update;
  if p_expected_revision is not null and (c.user_id is null or c.revision<>p_expected_revision) then return false; end if;
  if c.user_id is not null and c.google_sub<>p_google_sub then raise exception 'Google identity mismatch'; end if;
  if length(p_access_token) not between 1 and 16384 or length(p_google_sub) not between 1 and 256 then raise exception 'Invalid credential'; end if;
  if p_refresh_token is not null and length(p_refresh_token) not between 1 and 16384 then raise exception 'Invalid credential'; end if;
  access_id:=c.access_secret_id; refresh_id:=c.refresh_secret_id;
  if access_id is null then access_id:=vault.create_secret(p_access_token);
  else perform vault.update_secret(access_id,p_access_token); end if;
  if p_refresh_token is not null then
    if refresh_id is null then refresh_id:=vault.create_secret(p_refresh_token);
    else perform vault.update_secret(refresh_id,p_refresh_token); end if;
  end if;
  insert into public.lull_google_connections(user_id,google_sub,access_secret_id,refresh_secret_id,expires_at)
  values(p_user_id,p_google_sub,access_id,refresh_id,p_expires_at)
  on conflict(user_id) do update set access_secret_id=excluded.access_secret_id,refresh_secret_id=excluded.refresh_secret_id,
    expires_at=excluded.expires_at,revision=lull_google_connections.revision+1,updated_at=now();
  return true;
end;
$$;

create or replace function public.lull_google_cleanup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from vault.secrets where id in (old.access_secret_id,old.refresh_secret_id);
  return old;
end;
$$;
drop trigger if exists lull_google_cleanup on public.lull_google_connections;
create trigger lull_google_cleanup after delete on public.lull_google_connections for each row execute function public.lull_google_cleanup();

create or replace function public.lull_google_connection_delete(p_user_id uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.lull_google_connections where user_id=p_user_id;
$$;

revoke all on function public.lull_google_connection_get(uuid) from public,anon,authenticated;
revoke all on function public.lull_google_connection_save(uuid,text,text,text,timestamptz,bigint) from public,anon,authenticated;
revoke all on function public.lull_google_connection_delete(uuid) from public,anon,authenticated;
revoke all on function public.lull_google_cleanup() from public,anon,authenticated;
grant execute on function public.lull_google_connection_get(uuid) to service_role;
grant execute on function public.lull_google_connection_save(uuid,text,text,text,timestamptz,bigint) to service_role;
grant execute on function public.lull_google_connection_delete(uuid) to service_role;
commit;
