# 03 — Code-Walkthrough & Mitmach-Aufgabe

## Code-Tour (für die Stunde)

Wir gehen fünf Stellen zusammen durch. UE2 ist zum ersten Mal eine **Multi-Datei-React-App** — wir sehen das Zusammenspiel von Hooks, Komponenten und einem Datenmodell.

1. **`src/lib/workflow.ts`** — Das Workflow-Datenmodell. Status-Union, Labels, erlaubte Übergänge als reine Map. **Spiegel** der `apl2.workflow_transition`-Tabelle; muss bei jeder Migration nachgezogen werden. Defense-in-Depth: Client kennt die Regeln, Server-Trigger validiert sie nochmal.

2. **`src/hooks/useAntraege.ts`** — Der Realtime-Hook für die Inbox. Lädt initial alle Anträge, abonniert dann den Supabase-Channel auf `apl2.antraege`-Änderungen und merged Inserts/Updates ins lokale State. Lehrreiche Stelle: wie behandelt man eine RT-Update, die ein Insert ist, aber wir haben den Datensatz schon? (idempotent merge per `id`).

3. **`src/pages/Inbox.tsx`** — Die Listen-Ansicht. Sortier-Spalten, StatusBadge, „Öffnen"-Button auf jede Zeile. Optisch an die UE3-Inbox angeglichen (gleiche Tailwind-Tokens), aber **ohne** KI-Features (kein Risiko-Score, kein Vorjahres-Vergleich) — das ist genau der Unterschied zur nächsten Stufe.

4. **`src/pages/AntragDetail.tsx`** — Die Detail-Sicht. Vier Bereiche: Stammdaten (read-only), Anlagen-Liste mit Download-Buttons (signed URLs), Status-Select (zeigt nur erlaubte Übergänge, basierend auf `workflow.ts`), History-Timeline. **Mutter aller Sachbearbeiter-Views** — UE3 erbt diese Struktur und füllt sie mit KI-Cards.

5. **`supabase/webhooks/n8n-apl2-eingangsbestaetigung.json`** — Der Mail-Workflow. Webhook-Trigger lauscht auf `pg_notify` von Insert-Trigger, baut die Mail per **Switch-Node** (`{de, it, tr, es}` → 4 verschiedene Templates), schickt sie per SMTP. Lehrreich: wie modelliert man n8n „4 Sprachen" sauber — eine Switch-Node + ein Template-Node pro Sprache.

## Mitmach-Aufgabe (11:45–12:10)

Wählen Sie eine von vier Mini-Aufgaben:

### Aufgabe A — Sechsten Status „eskaliert" ergänzen

Vollständiger Defense-in-Depth-Sweep:

1. **SQL** im Supabase-Studio:
   ```sql
   insert into apl2.workflow_transition (von_status, nach_status) values
     ('in_pruefung', 'eskaliert'),
     ('eskaliert',   'bewilligt'),
     ('eskaliert',   'abgelehnt');
   ```
2. **`src/lib/workflow.ts`**: `Status`-Union erweitern, `STATUS_ORDER`, `STATUS_LABELS`, `TRANSITIONS` ergänzen
3. **`src/components/StatusBadge.tsx`**: Farb-Mapping für „eskaliert" (z.B. orange-Akzent)
4. **`npm test && npm run build`** — bleibt alles grün?
5. **Diskussion**: Wer darf eskalieren? Wer darf eine Eskalation aufheben? Wo modelliert man das — neue Spalte in `allow_email` oder dediziertes Rollen-System (`apl2.user_role`)?

### Aufgabe B — Fünfte Sprache in der Eingangsbestätigung

1. In `n8n-apl2-eingangsbestaetigung.json` (oder live im n8n-UI) die Switch-Expression um einen Fall erweitern (z.B. `fr` / `pl` / `uk`)
2. Neues Template-Node mit der übersetzten Mail
3. UE1-Webformular: neue Sprache als Option (siehe Aufgabe B im UE1-Walkthrough)
4. Test: Antrag in der neuen Sprache absenden, Mail sollte im richtigen Wortlaut ankommen
5. Diskussion: Wer pflegt die Übersetzungen? Bei Wortlaut-Updates der Förderrichtlinie — wer übersetzt nach?

### Aufgabe C — Rückfrage-Workflow durchspielen

Praktische Aufgabe ohne Code:

1. Eigenen Demo-Antrag in UE1 abschicken
2. Im UE2-Cockpit öffnen, Status auf „in_pruefung" setzen
3. Status auf „rueckfrage" setzen (mit Kommentar, z.B. „Bitte Anlage 2 nachreichen")
4. Im History-Tab prüfen, ob der Audit-Trail-Eintrag mit Kommentar sichtbar ist
5. Status zurück auf „in_pruefung" (Reverse-Transition) — versuchen Sie auch eine verbotene Transition (z.B. `eingegangen` → `bewilligt`); was meldet die DB?
6. Diskussion: Wo gehört der Kommentar fachlich hin — in den Audit-Trail oder in einen extra „Notizen"-Bereich pro Antrag? Was, wenn der Bürger den Kommentar erhalten soll?

### Aufgabe D — Eigene Supabase-Instanz

1. `supabase.com` → neues Projekt
2. Migrationen 001–014 aus `../../supabase/migrations/` im SQL-Editor ausführen
3. Storage-Bucket `antragsbelege` anlegen (private)
4. In Supabase → Authentication → Settings → SMTP-Config eintragen (Gmail / SendGrid / …)
5. Eigene Mail in `apl2.allow_email` einfügen
6. `.env.local`: `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` aus Project-Settings
7. `npm install && npm run dev`, Magic-Link-Mail abwarten, einloggen
8. Diskussion: Eigener Supabase-Account vs. Self-hosted auf VPS — Kosten, Datenhoheit, Wartung
