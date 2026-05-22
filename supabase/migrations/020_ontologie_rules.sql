-- 020_ontologie_rules.sql
-- Cross-Field-Regeln als JSON-Logic für Layer B der UE3-Prüfung.
create table apl2.ontologie_rules (
  id uuid primary key default gen_random_uuid(),
  plan_id text not null references apl2.ahp_plaene(id),
  rule_name text not null,
  beschreibung text,
  condition_jsonb jsonb not null,
  fehler_msg_de text not null,
  schwere text not null check (schwere in ('verstoss', 'hinweis')),
  paragraph_ref text,
  aktiv boolean not null default true,
  created_at timestamptz default now(),
  unique (plan_id, rule_name)
);

create index idx_ontologie_rules_plan_aktiv on apl2.ontologie_rules(plan_id, aktiv);

insert into apl2.ontologie_rules (plan_id, rule_name, beschreibung, condition_jsonb, fehler_msg_de, schwere, paragraph_ref) values
  ('APL2', 'miete_xor_unentgeltlich', 'Wenn unentgeltlich, dann Miete = 0',
    '{"if":[{"==":[{"var":"raeume_unentgeltlich"},"ja"]},{"==":[{"var":"miete_jahr_euro"},0]},true]}',
    'Räume sind als unentgeltlich angegeben, aber es wird Miete geltend gemacht.',
    'verstoss', '§ 4.2 AHP-Richtlinie'),
  ('APL2', 'mindestens_eine_kostenposition', 'Kostennachweis erforderlich',
    '{"or":[{">":[{"var":"betriebskosten_vorjahr_euro"},0]},{">":[{"var":"personalkosten_vorjahr_euro"},0]}]}',
    'Mindestens eine Kostenposition muss angegeben sein.',
    'verstoss', '§ 4.1 AHP-Richtlinie'),
  ('APL2', 'wochenplan_min_1_tag', 'Mindestens 1 Öffnungstag',
    '{">=":[{"var":"oeffnungstage_count"},1]}',
    'Eine Altentagesstätte muss mindestens an einem Wochentag geöffnet sein.',
    'verstoss', '§ 4 AHP-Richtlinie'),
  ('APL2', 'plausible_personalkosten', 'Personalkosten plausibel',
    '{"<":[{"var":"personalkosten_pro_oeffnungstag"},2000]}',
    'Personalkosten pro Öffnungstag scheinen ungewöhnlich hoch — bitte prüfen.',
    'hinweis', '§ 4.1 AHP-Richtlinie'),
  ('APL2', 'haushaltsjahr_in_range', 'Haushaltsjahr plausibel',
    '{"and":[{">=":[{"var":"haushaltsjahr"},2024]},{"<=":[{"var":"haushaltsjahr"},2027]}]}',
    'Haushaltsjahr außerhalb des plausiblen Bereichs.',
    'verstoss', '§ 1 AHP-Richtlinie');

grant select on apl2.ontologie_rules to authenticated, anon, service_role;
notify pgrst, 'reload schema';
