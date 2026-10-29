begin;

create table if not exists public.lull_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.lull_library_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  collection text not null check (collection in ('likes','playlists','playlist_tracks','saved','history','stats')),
  item_id text not null check (length(item_id) between 1 and 512),
  value jsonb not null check (octet_length(value::text) <= 2097152),
  deleted boolean not null default false,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, collection, item_id)
);

create table if not exists public.lull_user_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (key in ('queue','preferences','lyrics','wave')),
  value jsonb not null check (octet_length(value::text) <= 2097152),
  device_id uuid not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create or replace function public.lull_stamp_update() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = clock_timestamp();
  new.revision = old.revision + 1;
  return new;
end;
$$;

create or replace function public.lull_create_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.lull_profiles(user_id, display_name, avatar_url)
  values(new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''), new.raw_user_meta_data->>'avatar_url')
  on conflict(user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.lull_create_profile() from public, anon, authenticated;
drop trigger if exists lull_create_profile on auth.users;
create trigger lull_create_profile after insert on auth.users for each row execute function public.lull_create_profile();

do $$
declare name text;
begin
  foreach name in array array['lull_profiles','lull_library_entries','lull_user_state'] loop
    execute format('alter table public.%I enable row level security', name);
    execute format('revoke all on table public.%I from anon, authenticated', name);
    execute format('grant select, insert, update on table public.%I to authenticated', name);
    execute format('drop policy if exists owner_read on public.%I', name);
    execute format('create policy owner_read on public.%I for select to authenticated using ((select auth.uid()) = user_id)', name);
    execute format('drop policy if exists owner_insert on public.%I', name);
    execute format('create policy owner_insert on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', name);
    execute format('drop policy if exists owner_update on public.%I', name);
    execute format('create policy owner_update on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', name);
    execute format('drop trigger if exists lull_stamp_update on public.%I', name);
    execute format('create trigger lull_stamp_update before update on public.%I for each row execute function public.lull_stamp_update()', name);
  end loop;
end;
$$;

do $$
declare name text;
begin
  foreach name in array array['lull_library_entries','lull_user_state'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=name) then
      execute format('alter publication supabase_realtime add table public.%I', name);
    end if;
  end loop;
end;
$$;
commit;
