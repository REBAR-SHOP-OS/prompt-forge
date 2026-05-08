insert into storage.buckets (id, name, public)
values ('user-videos', 'user-videos', true)
on conflict (id) do nothing;

create policy "user-videos public read"
on storage.objects for select
using (bucket_id = 'user-videos');

create policy "user-videos owner insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'user-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "user-videos owner delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'user-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
