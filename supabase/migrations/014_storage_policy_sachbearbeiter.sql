-- 014_storage_policy_sachbearbeiter.sql
-- Storage-Policy: Sachbearbeiter (authenticated mit Allowlist-Rolle)
-- dürfen Files aus antragsbelege-Bucket lesen → erlaubt createSignedUrl()
-- im Frontend (AnlageDownload-Komponente).
-- UE1's submit-antrag schreibt mit SERVICE_ROLE und ist von RLS unbetroffen.

drop policy if exists "sachbearbeiter_select_antragsbelege" on storage.objects;
create policy "sachbearbeiter_select_antragsbelege" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'antragsbelege'
    and apl2.current_user_role() is not null
  );
