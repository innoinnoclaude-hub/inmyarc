-- ============================================================
-- One optional attachment per task.
--
-- The file itself goes to Supabase Storage (bucket `task-files`); the row keeps
-- the path plus what is needed to show it without fetching it: original name,
-- MIME type and size. There is no server of our own, so Storage is the only
-- place a file can live where the whole team can read it.
--
--   * the bucket is PRIVATE — the board opens a file through a short-lived
--     signed URL, so a leaked link stops working. Reading still only needs the
--     public anon key, same as the board's data.
--   * uploads are allowed, overwrites and deletes are not: a file, once
--     uploaded, cannot be replaced or removed from the browser. Clearing an
--     attachment clears the columns and leaves the object orphaned.
--   * the attachment columns follow the same rules as the rest of a task: the
--     board may set them only inside the open window, and an admin may set them
--     on any day through admin_update_entry.
--
-- The storage half is guarded, so this file still runs on a plain Postgres
-- (a fresh build without Supabase's `storage` schema) — see §9 of VERSION.md.
-- ============================================================

alter table public.entries add column if not exists attachment_path text;
alter table public.entries add column if not exists attachment_name text;
alter table public.entries add column if not exists attachment_type text;
alter table public.entries add column if not exists attachment_size integer;

-- all four together or none, and never bigger than the bucket allows
alter table public.entries drop constraint if exists entries_attachment_check;
alter table public.entries add constraint entries_attachment_check check (
  (attachment_path is null and attachment_name is null and attachment_size is null)
  or (attachment_path is not null and attachment_name is not null
      and attachment_size between 1 and 10485760)
);

-- the board writes its own attachment; the date window still applies through RLS
grant insert (attachment_path, attachment_name, attachment_type, attachment_size)
  on public.entries to anon, authenticated;
grant update (attachment_path, attachment_name, attachment_type, attachment_size)
  on public.entries to anon, authenticated;

-- ---------- admin edits on any day ----------
-- passing any attachment key sets all four, so "replace" and "clear" both work
create or replace function public.admin_update_entry(p_pass text, p_id uuid, p_patch jsonb)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $function$
begin
  perform public.require_passcode(p_pass);
  update public.entries set
    title      = coalesce(p_patch->>'title', title),
    details    = case when p_patch ? 'details'    then nullif(btrim(p_patch->>'details'), '')  else details    end,
    status     = coalesce(p_patch->>'status', status),
    minutes    = case when p_patch ? 'minutes'    then (p_patch->>'minutes')::integer          else minutes    end,
    impact     = case when p_patch ? 'impact'     then (p_patch->>'impact')::integer           else impact     end,
    efficiency = case when p_patch ? 'efficiency' then (p_patch->>'efficiency')::integer       else efficiency end,
    remarks    = case when p_patch ? 'remarks'    then nullif(btrim(p_patch->>'remarks'), '')  else remarks    end,
    status_by  = case when p_patch ? 'status_by'  then (p_patch->>'status_by')::uuid           else status_by  end,
    status_at  = case when p_patch ? 'status_at'  then (p_patch->>'status_at')::timestamptz    else status_at  end,
    attachment_path = case when p_patch ? 'attachment_path'
                           then nullif(btrim(p_patch->>'attachment_path'), '') else attachment_path end,
    attachment_name = case when p_patch ? 'attachment_path'
                           then nullif(btrim(p_patch->>'attachment_name'), '') else attachment_name end,
    attachment_type = case when p_patch ? 'attachment_path'
                           then nullif(btrim(p_patch->>'attachment_type'), '') else attachment_type end,
    attachment_size = case when p_patch ? 'attachment_path'
                           then (p_patch->>'attachment_size')::integer         else attachment_size end
  where id = p_id;
  if not found then raise exception 'No such entry.' using errcode = 'P0002'; end if;
end $function$;

revoke all on function public.admin_update_entry(text, uuid, jsonb) from public;
grant execute on function public.admin_update_entry(text, uuid, jsonb) to anon, authenticated;

-- ---------- storage (Supabase only) ----------
do $$
begin
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'storage' and table_name = 'buckets') then
    raise notice 'no storage schema — skipping bucket setup (plain Postgres)';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit)
  values ('task-files', 'task-files', false, 10485760)
  on conflict (id) do update
    set public = false, file_size_limit = 10485760;

  -- Supabase grants anon every privilege on the storage tables by default, and
  -- those grants are owned by supabase_storage_admin, which the `postgres` role
  -- is not a member of — so they cannot be taken back from a normal connection
  -- (tried 2026-09-29). What protects the files instead:
  --   * RLS on storage.objects, asserted below, so only the two policies below
  --     let anon touch a row: read and insert, this bucket only
  --   * PostgREST exposes `public` and `graphql_public`, not `storage`, so the
  --     table grants are not reachable over the API at all
  -- To tighten the grants anyway, run the revokes in the Supabase dashboard's
  -- SQL editor as supabase_storage_admin. See §10 of VERSION.md.
  if not (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass) then
    raise exception 'RLS is off on storage.objects — attachments would be wide open';
  end if;

  -- read and upload for the browser; no update, no delete
  execute 'drop policy if exists task_files_read on storage.objects';
  execute $p$create policy task_files_read on storage.objects for select
            to anon, authenticated using (bucket_id = 'task-files')$p$;
  execute 'drop policy if exists task_files_insert on storage.objects';
  execute $p$create policy task_files_insert on storage.objects for insert
            to anon, authenticated with check (bucket_id = 'task-files')$p$;
end $$;
