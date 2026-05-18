-- 002_storage_belege.sql — privater Storage-Bucket für APL-2-Anlagen

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'antragsbelege',
  'antragsbelege',
  false,
  10485760,
  array['application/pdf','image/jpeg','image/png']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public = excluded.public;
