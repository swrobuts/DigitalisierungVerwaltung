# 04 — Studi-Aufgaben: UE0 selbst durcharbeiten

> Diese Aufgaben sind für das **Selbststudium** konzipiert (mit oder ohne
> begleitende Vorlesung). Plan ein: 60–90 Minuten für Aufgaben 1–3, je
> 2–4 Stunden für die Vertiefungsaufgaben A–D.

## Lernziele

Nach Bearbeitung dieser Aufgaben kannst du:

1. **Konzeptionell** erklären, warum eine PDF-Upload-Pipeline mit
   KI-OCR ein sinnvoller Zwischenschritt zwischen „Mail-Anhang"
   und „strukturiertes Webformular" ist.
2. **Technisch** die vier beteiligten Schichten (Frontend, Edge
   Function, DB-Trigger, n8n) benennen und ihre Verantwortung
   abgrenzen.
3. **Praktisch** den End-to-End-Flow durchklicken und an einer
   Stelle eingreifen (Prompt-Tuning, neue Anlage, Realtime-Polling).
4. **Rechtlich** die DSGVO-/AI-Act-Implikationen des Cloud-OCR
   einschätzen und Alternativen benennen.

---

## Teil A — Verständnis (10 Min, allein)

### Quiz 1 — Reifegradstufen

Welche der folgenden Aussagen sind **richtig** für UE0?

- [ ] UE0 ersetzt den E-Mail-Eingang im Amt vollständig.
- [ ] UE0 setzt voraus, dass die Bürger:in einen Computer mit
      ausgefülltem PDF hat.
- [ ] Der OCR-Schritt funktioniert auch bei handschriftlich
      ausgefüllten Anträgen.
- [ ] UE0 schreibt direkt in `apl.antraege`.
- [ ] Nach erfolgreicher OCR wird die Bürger:in automatisch zu UE1
      weitergeleitet.

<details><summary>Lösung</summary>

- ❌ UE0 ersetzt den E-Mail-Eingang vollständig — falsch. UE0 ist ein
  zusätzlicher Kanal; E-Mails bleiben technisch möglich.
- ✅ Bürger:in braucht (noch) das PDF — UE0 ist absichtlich „PDF-zentrisch".
- ✅ Vision-OCR liest auch Handschrift (Claude Vision via Anthropic).
- ❌ UE0 schreibt in `apl.antrag_einreichung` (Tracking-Tabelle) +
  `extrahiert_jsonb`. Der echte `apl.antraege`-Eintrag entsteht erst
  beim UE1-Submit.
- ✅ Auto-Redirect nach Status „fertig" zu `antrag.butscher.cloud/?prefill=...`.

</details>

### Quiz 2 — Architektur-Zuordnung

Welche Komponente macht **was**? Ordne zu:

| Komponente | Verantwortung |
|---|---|
| (a) Frontend `ue0/upload-portal/src/views/fb-upload.ts` | |
| (b) Edge Function `upload-antragspdf` | |
| (c) DB-Trigger `trg_notify_n8n_on_pdf_einreichung` | |
| (d) n8n-Workflow `n8n-ue0-pdf-ocr.json` | |

Optionen für die Spalte „Verantwortung":
- 1. validiert MIME + Größe, lädt in Storage, erzeugt Tracking-Eintrag
- 2. Drag-and-Drop-UI mit zwei Boxen (Pflicht + Optional), baut FormData
- 3. ruft Claude Vision auf, parst JSON, mergt in `extrahiert_jsonb`
- 4. lauscht auf `pg_notify`, feuert HTTP-POST an n8n-Webhook

<details><summary>Lösung</summary>

a → 2, b → 1, c → 4, d → 3

</details>

---

## Teil B — Praktischer Durchlauf (15–30 Min)

### Aufgabe 1 — Hello World

1. Öffne <https://upload.butscher.cloud/>.
2. Lade `ue0/demo-pdfs/demo-antrag-pfarrei-st-albert.pdf` hoch
   (siehe Repo).
3. Beobachte die Status-Seite: welche Zwischen-Texte siehst du?
   Wie lange dauert es bis zum Auto-Redirect?
4. Auf der UE1-Seite: welche Felder sind vorausgefüllt? Bist du
   überrascht über die Treffsicherheit?

**Reflexion:** Was würde ein Mensch im Amt brauchen, um dieselben
Felder aus dem PDF abzulesen und händisch ins System zu tippen?
Wie viel Zeit sparst du hier konkret?

### Aufgabe 2 — Handschrift testen

1. Lade `demo-antrag-buergerverein-handschrift.pdf` hoch (Demo mit
   Handschrift-anmutender Font).
2. Vergleiche das Ergebnis mit Aufgabe 1: sind die ausgelesenen
   Werte identisch korrekt? Wo siehst du Unterschiede?
3. Optional: drucke das echte Original-Antrags-PDF aus, fülle
   handschriftlich aus, scanne und teste damit.

**Reflexion:** An welcher Stelle ist die OCR „gut genug" und wo
braucht es zwingend den menschlichen Kontroll-Schritt (UE1)?

### Aufgabe 3 — Browser-Console F12

1. Öffne `https://upload.butscher.cloud/` mit F12-Konsole geöffnet.
2. Im Network-Tab: filtere nach `functions` oder `upload-antragspdf`.
3. Lade ein PDF hoch — beobachte den POST-Request:
   - Welches Format hat das Request-Body? (Hint: `FormData`)
   - Welche Header werden gesendet?
   - Was kommt zurück (Response-JSON mit `einreichung_id`)?
4. Im Console-Tab: kommen Fehler? Was loggt der Status-Polling-Code?

---

## Teil C — Mitmach-Aufgaben (Vertiefung, 2–4 h)

### Aufgabe A — OCR-Prompt verbessern

In `supabase/webhooks/n8n-ue0-pdf-ocr.json` (oder live im n8n-UI) den
Hauptantrag-Claude-Prompt anpassen:

> *„Wenn das Feld 'monatliche Mietzahlungen' leer ist, gib `null` zurück
> — nicht `0`."*

**Hintergrund:** `0` heißt „keine Miete", `null` heißt „nicht
angegeben". Das macht im Bescheid einen Unterschied (UE3 prüft
Cross-Field: „kein eigener Raum + keine Miete = Antragsfehler").

**Bonus:** Verifiziere mit `demo-antrag-buergerverein-handschrift.pdf`,
dass die Änderung greift.

---

### Aufgabe B — Neues Anlagen-Feld

Erweitere das Konzept um eine **Anlage 2: Programm-Flyer**.

1. `src/views/fb-upload.ts`: dritte Box (auch optional, grau)
   ergänzen
2. Edge Function: `anlage_2_storage_path` in Tracking-Insert
3. Migration: Spalte `anlage_2_storage_path text null`
4. n8n: zweiten IF-Branch
5. UE1 würde dann das gelieferte Programm-Flyer-File automatisch
   als „Programm-Nachweis erbracht" werten (Step 5 auto-complete)

**Diskussion:** Wie weit treibt man die OCR? Die Demo hat den
Wochenplan parsbar gemacht — aber ein freier Flyer-Text ist
semantisch zu offen, hier reicht der reine Upload-Nachweis.

---

### Aufgabe C — Wartedauer optimieren

Aktuell pollt das Frontend alle 3 s den Status. Bei einer Pipeline,
die typischerweise 10–20 s läuft, sind das 3–7 Polls. Schöner wäre
Realtime.

1. `apl.antrag_einreichung` ist Realtime-aktiviert (RLS lässt es
   zu) → in `src/views/status.ts` ein `supabase.channel().on('postgres_changes', …)`
   abonnieren
2. Polling-Fallback behalten (falls Realtime mal hängt)
3. Smoke-Test: Upload + sofort die Latenz messen, wann der
   „fertig"-Wechsel sichtbar wird

---

### Aufgabe D — Eigene Supabase

1. `supabase.com` → neues kostenloses Projekt
2. Migrationen 001–067 im Repo ausführen (`supabase/migrations/`),
   Bucket `antragseingang-pdf` anlegen
3. Edge Function deployen, n8n-Workflow importieren
4. Eigene `.env.local`, `npm run dev`, Demo-PDF hochladen
5. **Diskussion:** Was kostet ein produktives Betreiben? Welche
   Tiers brauchst du, wenn 1.000 Anträge/Monat reinkommen?

---

## Teil D — Reflexion (15 Min, schriftlich)

Beantworte schriftlich (300–500 Wörter):

1. **Aus Sicht der Bürger:in:** Welche Erfahrung verändert UE0
   konkret gegenüber dem „E-Mail-Anhang"? Wo bleibt es gleich, wo
   merkt der/die Bürger:in einen Unterschied?

2. **Aus Sicht des Amtes:** Welche Aufgabe entfällt durch UE0?
   Welche neue kommt dafür hinzu (z.B. Maintenance der OCR-Pipeline,
   Monitoring der Erfolgsquote)?

3. **Aus Sicht der Sicherheit/DSGVO:** Wo geht das PDF überall durch?
   An welcher Stelle würdest du eine **TIA (Transfer Impact Assessment)**
   ansetzen müssen? Welche EU-konforme Alternative zu Anthropic könntest
   du wählen, und was würde sie kosten oder erschweren?

4. **Aus Sicht der nächsten Reifegradstufe:** Welche Schwächen von
   UE0 löst UE1 (Webformular direkt) auf? Wann ist UE0 trotzdem die
   bessere Wahl als UE1?

---

## Bonus — eigene Diagnose

Wenn du in der Pipeline hängenbleibst, hier die Diagnose-Reihenfolge
(jede Schicht testbar):

```
1. Browser-Konsole F12 — Fehler beim Upload?
2. https://supabase.butscher.cloud/functions/v1/upload-antragspdf
   per `curl -F` testen → kommt eine einreichung_id?
3. https://supabase.butscher.cloud/rest/v1/antrag_einreichung
   mit apikey lesen → ist der Eintrag da?
4. n8n-UI → Executions → war der Workflow getriggert?
5. n8n-Workflow Last-Run → Claude-Response unter „output" sehen
6. UPDATE-Node in n8n → ist `status='fertig'` geschrieben worden?
```

Wenn ein Schritt fehlschlägt, ist die schadhafte Schicht eindeutig.
