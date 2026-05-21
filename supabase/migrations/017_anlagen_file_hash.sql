-- 017_anlagen_file_hash.sql
-- Hash-Dedupe für Anlagen: SHA-256 des File-Inhalts ermöglicht es der
-- Edge Function submit-antrag, identische Files nur einmal zu speichern.

alter table apl2.anlagen add column if not exists file_hash text;
create index if not exists idx_anlagen_hash on apl2.anlagen(file_hash);

notify pgrst, 'reload schema';
