begin;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-4000-8000-000000000001','authenticated','authenticated','rls-a@lull-test.invalid','{"provider":"google","providers":["google"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000002','authenticated','authenticated','rls-b@lull-test.invalid','{"provider":"google","providers":["google"]}','{}',now(),now());
insert into public.lull_library_entries(user_id,collection,item_id,value)
values ('00000000-0000-4000-8000-000000000002','likes','private-b','{"track":{"id":"private-b"}}');
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into public.lull_library_entries(user_id,collection,item_id,value)
values ('00000000-0000-4000-8000-000000000001','likes','own-a','{"track":{"id":"own-a"}}');
do $$
declare denied boolean := false; affected integer;
begin
  if (select count(*) from public.lull_library_entries) <> 1 then raise exception 'Another account data is visible'; end if;
  begin
    insert into public.lull_library_entries(user_id,collection,item_id,value)
    values ('00000000-0000-4000-8000-000000000002','likes','forbidden','{}');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Writing another account data was allowed'; end if;
  update public.lull_library_entries set value='{}' where user_id='00000000-0000-4000-8000-000000000002';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Updating another account data was allowed'; end if;
end;
$$;
set local role anon;
do $$
declare denied boolean := false;
begin
  begin perform * from public.lull_library_entries;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Anonymous library access was allowed'; end if;
end;
$$;
reset role;
rollback;
