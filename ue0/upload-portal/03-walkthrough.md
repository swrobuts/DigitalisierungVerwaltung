# 03 — Code-Walkthrough & Mitmach-Aufgabe

## Code-Tour (für die Stunde)

Wir gehen fünf Stellen zusammen durch. UE0 ist eine **verteilte Pipeline** — Code lebt in 3 Repos/Sprachen, jedes Stück hat genau eine Verantwortung.

1. **`ue0/upload-portal/src/upload.ts`** — Das Frontend-Herzstück. Rendert zwei optisch getrennte Boxen (Pflicht/Optional), validiert MIME + Größe, baut `FormData` mit beiden Files in **einem** POST, fängt Fehler und zeigt sie inline. Drag-and-Drop nativ über `dragenter`/`drop`-Events.

2. **`supabase/functions/upload-antragspdf/index.ts`** — Die Edge Function (Deno). Vier Verantwortungen: CORS-Allowlist prüfen, beide PDFs validieren (MIME + ≤ 10 MB), in Storage hochladen, Tracking-Eintrag erzeugen. **Atomarität**: bei Upload-Fehler des Optional-Files wird der Hauptantrag NICHT zurückgerollt — die Anlage ist optional.

3. **`supabase/migrations/047_ue0_pdf_einreichung.sql`** — Tabelle `apl2.antrag_einreichung`, RLS (anon darf POST + eigenen Status lesen), DB-Trigger `trg_notify_n8n_on_pdf_einreichung` (`pg_notify` → http_post an n8n-URL aus `app.n8n_ue0_webhook`-Setting). **Defense-in-Depth** für den n8n-Webhook: kein direkter Webhook-Aufruf aus dem Browser, alles geht über die DB.

4. **`supabase/webhooks/n8n-ue0-pdf-ocr.json`** — Der 11-Node-Workflow. Wichtigster Teil: der **IF-Switch** nach dem Hauptantrag-Parse. True-Branch lädt die Anlage 1 und mergt `oeffnungszeiten` in `extrahiert_jsonb`, false-Branch geht direkt zum finalen UPDATE. **Beide münden im gleichen UPDATE-Node** — n8n-Pull-Modell macht das sauber.

5. **`ue0/upload-portal/src/status.ts`** — Die Status-Seite. Pollt alle 3 s die DB, zeigt einen Spinner mit lebendigen Zwischen-Zuständen („PDF wird gelesen", „KI extrahiert Felder", „Anlage 1 wird ausgewertet"), und macht beim Status `fertig` einen **harten Redirect** auf UE1 (`window.location.href`) mit `?prefill=<einreichung_id>` — der Bürger landet ohne weiteren Klick im Webformular.

## Mitmach-Aufgabe (11:45–12:10)

Wählen Sie eine von vier Mini-Aufgaben:

### Aufgabe A — OCR-Prompt verbessern

In `supabase/webhooks/n8n-ue0-pdf-ocr.json` (oder live im n8n-UI) den Hauptantrag-Claude-Prompt anpassen:
> *„Wenn das Feld 'monatliche Mietzahlungen' leer ist, gib `null` zurück — nicht `0`."*

Hintergrund: `0` heißt „keine Miete", `null` heißt „nicht angegeben". Das macht im Bescheid einen Unterschied (UE3 prüft Cross-Field: „kein eigener Raum + keine Miete = Antragsfehler").

**Bonus**: Verifizieren Sie mit einem handschriftlichen Demo-PDF, dass die Änderung greift — `demo-antrag-buergerverein-handschrift.pdf` als Test.

### Aufgabe B — Neues Anlagen-Feld

Erweitern Sie das Konzept um eine **Anlage 2: Programm-Flyer**.

1. `upload.ts`: dritte Box (auch optional, grau) ergänzen
2. Edge Function: `anlage_2_storage_path` in Tracking-Insert
3. Migration: Spalte `anlage_2_storage_path text null`
4. n8n: zweiten IF-Branch
5. UE1 würde dann das gelieferte Programm-Flyer-File automatisch als „Programm-Nachweis erbracht" werten (Step 5 auto-complete)

Diskussion: Wie weit treibt man die OCR? Die Demo hat den Wochenplan parsbar gemacht — aber ein freier Flyer-Text ist semantisch zu offen, hier reicht der reine Upload-Nachweis.

### Aufgabe C — Wartedauer optimieren

Aktuell pollt das Frontend alle 3 s den Status. Bei einer Pipeline, die typischerweise 10–20 s läuft, sind das 3–7 Polls. Schöner wäre Realtime.

1. `apl2.antrag_einreichung` ist Realtime-aktiviert (RLS lässt es zu) → in `status.ts` ein Supabase-`channel().on('postgres_changes', …)` abonnieren
2. Polling-Fallback behalten (falls Realtime mal hängt)
3. Smoke-Test: Upload + sofort die Latenz messen, wann der „fertig"-Wechsel sichtbar wird

### Aufgabe D — Eigene Supabase

1. `supabase.com` → neues Projekt
2. Migrationen 001–049 ausführen, Bucket `antragseingang-pdf` anlegen
3. Edge Function deployen, n8n-Workflow importieren
4. Eigene `.env.local`, `npm run dev`, Demo-PDF hochladen
5. Diskussion: Was kostet ein produktives Betreiben? Welche Tiers brauchst du, wenn 1.000 Anträge/Monat reinkommen?
