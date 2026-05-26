# Sprint-Tag 2026-05-26 — Shared Antrag-Renderer + Auth-Fixes

Kompakter Changelog des Tages — ein langer Sprint zwischen
Pre-Flight-Checks und Vorlesungs-Demo. Vier Block-Themen.

## 1. UE2/UE3 Auth-Pipeline gefixt (3 verschachtelte Bugs)

| Bug | Wo | Fix |
| --- | --- | --- |
| `AUTH_REDIRECT` hartcodiert auf falsche Subdomain | `ue2/.../lib/supabase.ts`, `ue3/.../lib/supabase.ts` | Immer aus `window.location.origin` ableiten |
| Magic-Link Callback-Timeout (PKCE vs. Implicit) | beide `supabase.ts` | `flowType: "implicit"` (self-hosted GoTrue default) |
| `useUserRole` sah leere `allow_email`-Liste | DB Function `apl.current_user_role()` | Migration `069_apl_service_role_schema_usage.sql` — Function nutzt `auth.jwt() ->> 'email'` statt alter `current_setting('request.jwt.claim.email', true)` |

Plus die Docker-Compose `VITE_AUTH_REDIRECT`-Build-Args aus beiden
compose-Dateien entfernt — Default war Quelle des Cross-Domain-Bugs.

## 2. Field-Coverage-Refactor (Bürger ↔ Sachbearbeiter konsistent)

**Auslöser:** Bürger gibt `c_quartier_person_name` (FB-III-C) im UE1 ein,
Sachbearbeiter sieht es in UE2/UE3 nicht — drei FbBlocks-Stellen müssen
synchron aktualisiert werden, eine wurde vergessen.

**Lösung:** Neues Workspace-Paket `@dv/antrag-renderer` als Single Source
of Truth.

- Schema-Definition pro FB (`schemas/fb-{i,ii,iii,iv}.schema.ts`)
- Generischer `<AntragViewer fb=… data=… />` ersetzt 4 FB-spezifische
  Components in UE2 + UE3
- CI-Gate `tests/field-coverage.test.ts` schlägt an, wenn künftig eine
  DB-Spalte nicht im Schema landet
- 14/14 Tests grün, beide Apps TypeScript-sauber

**Bonus-Verbesserungen aus dem Refactor:**
- Pflichtfeld-Marker (`*`) automatisch an Labels
- Enum-Klartext: `GT_20` → „Über 20 Treffen / Vorjahr" (PDF-Wortlaut)
- jsonb-Listen (Drittmittel, andere_mittel) werden als UL gerendert
- FB-II Helfer-Tabelle bekommt Eintritt/Austritt-Spalten
- FB-III B-Variante: `b_quartiere` + `b_quartier_person_name` jetzt drin

Net-Diff: −430 Zeilen Duplicate-Code, +1 Datei mit Schema-Definition.

Siehe `packages/antrag-renderer/README.md` für die Anleitung „neues Feld
hinzufügen".

## 3. Fast-Deploy-Workflow

`docker compose build --no-cache` für UE2/UE3 dauert je ~20 Min (frischer
pnpm install im Container). Für reine Frontend-Code-Änderungen jetzt:

```bash
# Einmal-Setup auf VPS:
bash scripts/setup-fast-deploy.sh

# Pro Update auf dem Mac:
./scripts/dv-fast-deploy.sh both      # <60 Sek live
```

Mechanik: `docker-compose.override.yml` mountet
`/opt/dv-dist/{ue2,ue3}` als read-only Volume in den nginx-Container.
`dv-fast-deploy.sh` baut lokal mit `pnpm build` und rsynct die `dist/`.
nginx liefert die neuen Files sofort (kein Container-Restart nötig).

## 4. UE1 Helferliste (FB-II) erweitert

- Spalten `eintritt` + `austritt` (PDF-konform — siehe
  `anlage-ahp-2-helferliste.pdf`)
- **PDF-Import**: Bürger:in lädt eine bestehende Helferliste (auch
  handschriftlich) als PDF hoch → `pruefung-Service` extrahiert via Claude
  Vision → Zeilen werden zur Tabelle hinzugefügt (Halluzinations-Schutz:
  leere Zeilen werden verworfen)

## Test-Status nach dem Sprint

| Workspace | Tests |
| --- | --- |
| `packages/foerderbereiche` | 42/42 |
| `packages/data-layer` | 20/20 |
| `packages/antrag-renderer` (NEU) | 14/14 |
| `ue0/upload-portal` | 12/12 |
| `ue1/webformular` | 19/19 |
| `ue2/sachbearbeiter` | 21/21 |
| `ue3/sachbearbeitung-ki` | 20/20 |
| `ue4/agent-portal` | 18/18 |
| **GESAMT** | **166 / 166** |

Alle 5 Frontends bauen sauber (UE0 188 ms, UE4 788 ms, UE1 948 ms, UE2 1.62 s, UE3 2.64 s).

## Migrationen heute

- `068_submitted_language_5sprachen.sql` — CHECK-Constraint von
  `('de','tr')` auf `('de','tr','it','ru','fr')` erweitert
- `069_apl_service_role_schema_usage.sql` — `apl.current_user_role()`
  nutzt jetzt `auth.jwt() ->> 'email'` (Auth-Fix oben)
