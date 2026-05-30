# 03 — Code-Walkthrough für die Vorlesung

> Dieses Dokument ist die **Dozenten-Tour** durch den Code (ca. 15 Min).
> Die Studi-Aufgaben sind separat in [`04-aufgaben.md`](./04-aufgaben.md)
> dokumentiert — dort mit Quiz, Schritt-für-Schritt-Anleitung und
> Reflexionsfragen für 60-90 Min Selbststudium.

## Code-Tour (für die Stunde)

Wir gehen fünf Stellen zusammen durch. UE0 ist eine **verteilte Pipeline** — Code lebt in 3 Repos/Sprachen, jedes Stück hat genau eine Verantwortung.

1. **`ue0/upload-portal/src/upload.ts`** — Das Frontend-Herzstück. Rendert zwei optisch getrennte Boxen (Pflicht/Optional), validiert MIME + Größe, baut `FormData` mit beiden Files in **einem** POST, fängt Fehler und zeigt sie inline. Drag-and-Drop nativ über `dragenter`/`drop`-Events.

2. **`supabase/functions/upload-antragspdf/index.ts`** — Die Edge Function (Deno). Vier Verantwortungen: CORS-Allowlist prüfen, beide PDFs validieren (MIME + ≤ 10 MB), in Storage hochladen, Tracking-Eintrag erzeugen. **Atomarität**: bei Upload-Fehler des Optional-Files wird der Hauptantrag NICHT zurückgerollt — die Anlage ist optional.

3. **`supabase/migrations/047_ue0_pdf_einreichung.sql`** — Tabelle `apl2.antrag_einreichung`, RLS (anon darf POST + eigenen Status lesen), DB-Trigger `trg_notify_n8n_on_pdf_einreichung` (`pg_notify` → http_post an n8n-URL aus `app.n8n_ue0_webhook`-Setting). **Defense-in-Depth** für den n8n-Webhook: kein direkter Webhook-Aufruf aus dem Browser, alles geht über die DB.

4. **`supabase/webhooks/n8n-ue0-pdf-ocr.json`** — Der 11-Node-Workflow. Wichtigster Teil: der **IF-Switch** nach dem Hauptantrag-Parse. True-Branch lädt die Anlage 1 und mergt `oeffnungszeiten` in `extrahiert_jsonb`, false-Branch geht direkt zum finalen UPDATE. **Beide münden im gleichen UPDATE-Node** — n8n-Pull-Modell macht das sauber.

5. **`ue0/upload-portal/src/status.ts`** — Die Status-Seite. Pollt alle 3 s die DB, zeigt einen Spinner mit lebendigen Zwischen-Zuständen („PDF wird gelesen", „KI extrahiert Felder", „Anlage 1 wird ausgewertet"), und macht beim Status `fertig` einen **harten Redirect** auf UE1 (`window.location.href`) mit `?prefill=<einreichung_id>` — der Bürger landet ohne weiteren Klick im Webformular.

## Dozenten-Tipps für die Code-Tour

| Stelle | Was hervorheben | Häufige Studi-Frage |
|---|---|---|
| `fb-upload.ts` | Drag-and-Drop ist nativ HTML5 — kein React/keine Library nötig. Zwei Boxen klar getrennt für Pflicht/Optional. | „Warum nicht React?" — Antwort: für 5 Seiten Vanilla TS reicht, weniger Tooling, schneller geladen. |
| `upload-antragspdf/index.ts` | Edge Function = serverless Deno. CORS-Allowlist, MIME-Check, Größen-Check, **getrennte try/catch für Pflicht/Optional**. | „Was wenn die optionale Anlage fehlschlägt?" — Antwort: Hauptantrag bleibt, Anlage wird im Log markiert. Atomarität bewusst nicht hart. |
| `047_ue0_pdf_einreichung.sql` | RLS lässt anon nur **insert + eigenes select** (per UUID-Match). `pg_notify` → n8n-Webhook, **nicht** direkter Browser-Aufruf. | „Warum nicht webhook direkt aus Frontend?" — Antwort: dann wäre die n8n-URL public, Defense-in-Depth schützt sie. |
| `n8n-ue0-pdf-ocr.json` | Live im n8n-UI öffnen, IF-Switch erklären. Den Vision-Prompt zeigen — JSON-Schema im Prompt ist der wichtigste Halluzinations-Schutz. | „Was bei OCR-Fehler?" — Antwort: UE1 ist der Kontroll-Schritt. Bürger:in korrigiert vor finalem Submit. |
| `status.ts` | Polling mit Backoff, **Auto-Redirect** zu UE1 mit `?prefill=<uuid>`. | „Wäre Realtime besser?" — Antwort: ja, ist Studi-Aufgabe C in 04-aufgaben.md. |

## Übergang zu den Studi-Aufgaben

Nach der Code-Tour: Verweis auf [`04-aufgaben.md`](./04-aufgaben.md) —
dort die vier Vertiefungs-Aufgaben (A bis D) mit detaillierten
Schritt-für-Schritt-Anleitungen und Reflexionsfragen.

Empfohlene Stundenverteilung:
- **15 Min** — Code-Tour (dieses Dokument)
- **20 Min** — Live-Demo + Diskussion (siehe `slides.html` Slide 5)
- **45 Min** — Studi wählt eine Aufgabe A/B/C/D und beginnt (Hilfe vom Dozent)
- **10 Min** — Kurze Ergebnis-Vorstellung 2-3 Studis
