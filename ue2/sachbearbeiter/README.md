# UE2 — Sachbearbeiter-App (`amt.butscher.cloud`)

> **Reifegradstufe 2:** Sachbearbeiter sehen alle eingegangenen Anträge, ändern Status, sehen den vollen Audit-Trail. Bürger bekommt automatische Eingangsbestätigung per Mail (4 Sprachen).

## Was diese Stufe gegenüber UE1 gewinnt

- **Bürger erfährt: Antrag ist angekommen** — automatische Mail (DE/IT/TR/ES via Switch-Expression)
- **Amt hat eine Inbox** — alle Anträge an einer Stelle, in Echtzeit aktualisiert (Supabase Realtime)
- **Workflow als Datenmodell** — erlaubte Übergänge in `apl2.workflow_transition`, validiert vom Postgres-Trigger (Defense-in-Depth)
- **Audit-Trail** in `apl2.antrag_history` — wer hat wann was geändert, mit Auto-Trigger und optionalem Kommentar
- **RLS-basierte Autorisierung** — nur Allowlist-User (`apl2.allow_email`) kommen rein

## Stack

- Frontend: Vite 6, React 19, Tailwind 4, TypeScript 5
- Routing: react-router-dom 7
- Auth + DB: `@supabase/supabase-js` 2.45 gegen Self-hosted Supabase
- Tests: Vitest 2 + Testing Library
- Deployment: Docker Multi-Stage → Nginx-Unprivileged → Traefik (mytlschallenge)

## Schnellstart (lokal, gegen die geteilte Supabase)

```bash
git clone https://github.com/swrobuts/DigitalisierungVerwaltung.git
cd DigitalisierungVerwaltung/ue2/sachbearbeiter
cp .env.example .env.local   # ANON_KEY aus /root/supabase/docker/.env auf VPS holen
npm install
npm run dev                  # http://localhost:5174
npm test                     # 15 Tests
```

## Schnellstart (Studi-Variante mit eigener Supabase Cloud)

1. `supabase.com` → neues Projekt
2. Migrationen 001–014 aus `../../supabase/migrations/` im SQL-Editor ausführen
3. Storage-Bucket `antragsbelege` anlegen (private)
4. `.env.local`: `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` aus Project-Settings
5. `npm install && npm run dev`

## Doku

- **Spec:** [`docs/superpowers/specs/2026-05-18-ue2-sachbearbeiter-workflow.md`](../../docs/superpowers/specs/2026-05-18-ue2-sachbearbeiter-workflow.md)
- **Implementation-Plan:** [`docs/superpowers/plans/2026-05-18-ue2-sachbearbeiter.md`](../../docs/superpowers/plans/2026-05-18-ue2-sachbearbeiter.md)
- **DB-Migrations:** [`supabase/migrations/007–014_*.sql`](../../supabase/migrations/)
- **n8n-Workflow:** [`supabase/webhooks/n8n-apl2-eingangsbestaetigung.json`](../../supabase/webhooks/n8n-apl2-eingangsbestaetigung.json)

## Demo

https://amt.butscher.cloud · Login mit freigeschalteter `@thws.de`-Adresse (Allowlist in `apl2.allow_email`).

## Hands-on-Aufgabe für Studierende

Erweitert den Workflow um einen 6. Status **„eskaliert"**:

1. SQL: `insert into apl2.workflow_transition (von_status, nach_status) values ('in_pruefung','eskaliert'), ('eskaliert','bewilligt'), ('eskaliert','abgelehnt');`
2. `src/lib/workflow.ts`: `Status`-Union um `"eskaliert"` erweitern, `STATUS_ORDER`, `STATUS_LABELS`, `TRANSITIONS` ergänzen
3. `src/components/StatusBadge.tsx`: Farbe für „eskaliert"
4. `npm test && npm run build` — alle Tests grün?
5. Diskussion: Wer darf eskalieren? Wer darf Eskalation aufheben? Wie modelliert man das im Rollen-System?

**Bonus:** 5. Sprache im n8n-Workflow ergänzen (`fr`/`pl`/…) und im UE1-Webformular als Sprachoption hinzufügen.
