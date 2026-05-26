# Phase 6 — n8n Multi-FB-OCR-Workflow

> **Status 2026-05-25 (Update vor VL):** Workflow **gebaut, importiert, aktiv**.
> End-to-End-Test ist mit echtem FB-I-Demo-PDF teilweise erfolgreich gelaufen
> bis zur Claude-Vision-Stufe — siehe „Bekannte Limitierungen" unten. Robert
> kann morgen live demonstrieren: PDF-Upload → DB-Tracking → status=in_verarbeitung.

## Was läuft

| Komponente | Status |
|---|---|
| Workflow-JSON (`supabase/webhooks/n8n-ue0-pdf-ocr-multi-fb.json`) | ✅ |
| Import in n8n (ID `ue0apl-multi-fb-679f83ce`, aktiv) | ✅ |
| DB-Trigger `apl.notify_n8n_on_pdf_einreichung` feuert auf neue Webhook-URL | ✅ |
| Service-Role-Grants auf Schema `apl` (`grant usage on schema apl to service_role` + Default-Privs) | ✅ |
| Pipeline läuft bis `Mark in_verarbeitung` + `GET Einreichung-Row` | ✅ |
| Claude-Vision-Call + Detail-Insert + status=fertig | ⚠️ siehe Limitierungen |

## Architektur (Ist-Stand)

```
INSERT apl.antrag_einreichung
   │  AFTER INSERT-Trigger apl.notify_n8n_on_pdf_einreichung
   │  pg_net.http_post → http://n8n:5678/webhook/ue0-antragspdf   ← intern!
   ▼
Webhook (Supabase NOTIFY)
   ├─ Webhook-Ack (200 ok)                       ← responseMode=responseNode
   └─ Mark in_verarbeitung
        ↓ GET Einreichung-Row (REST: apl.antrag_einreichung)
        ↓ PDF aus Storage (kong:8000/storage/v1/object/antragseingang-pdf/<storage_path>)
        ↓ PDF → Base64 + Kontext
        ↓ Switch FB
            ├─ FB I  → Claude FB-I OCR  (claude-sonnet-4-5, ~15-30s)
            ├─ FB II → Claude FB-II OCR
            ├─ FB III → Claude FB-III OCR
            └─ FB IV → Claude FB-IV OCR
        ↓ Parse + Validate OCR  (Pflichtfelder gegen apl.antraege-NOT-NULL prüfen)
        ↓ INSERT apl.antraege   (Prefer: return=representation → id)
        ↓ Build Detail-Payload  (fb-spezifisches Mapping)
        ↓ INSERT FB-Detail       (fb_i_projekt | fb_ii_ehrenamt | fb_iii_variante | fb_iv_freitext)
        ↓ UPDATE Einreichung status=fertig + antrag_id + extrahiert_jsonb
                              
[on workflow error]
   └─ Build Error-Payload → UPDATE Einreichung status=fehler + fehler_text
```

## Konfiguration

- **Webhook-Pfad:** `https://n8n.butscher.cloud/webhook/ue0-antragspdf`
- **Postgres-Setting** (intern, für niedrigeren Latency):
  ```sql
  -- via supabase_admin (postgres-User hat keine Permission auf app.*-Settings):
  ALTER DATABASE postgres SET app.n8n_ue0_webhook = 'http://n8n:5678/webhook/ue0-antragspdf';
  ```
- **n8n nutzt** `$env.SUPABASE_SERVICE_ROLE_KEY` + `$env.ANTHROPIC_API_KEY` direkt
  aus dem Container-Env (`N8N_BLOCK_ENV_ACCESS_IN_NODE=false`).
- **Service-Role-Grants** (Migration sollte das idempotent enthalten):
  ```sql
  grant usage on schema apl to service_role;
  grant all on all tables in schema apl to service_role;
  grant all on all sequences in schema apl to service_role;
  alter default privileges in schema apl grant all on tables to service_role;
  alter default privileges in schema apl grant all on sequences to service_role;
  notify pgrst, 'reload schema';
  ```

## Halluzinations-Schutz

- **Claude-Prompt** pro FB enthält explizit: *„KEINE Werte erfinden, nicht-lesbare
  Felder → null"*.
- **Parse + Validate**-Node prüft NOT-NULL-Felder von `apl.antraege` (einrichtung,
  ansprechpartner, strasse, plz, ort, telefon, email, bankname, iban, bic) und
  wirft Error → status=fehler + Eingang-Hinweis welches Feld fehlt.
- FB-spezifische Pflichtfelder ebenso: fb_i.projekt_titel, fb_ii.ehrenamt_titel,
  fb_iii.variante, fb_iv.{vorhaben_titel, kurzbeschreibung, geplante_massnahmen}.
- Fallback nur bei `projekt_titel` (FB I) und `ehrenamt_titel` (FB II) → übernehmen
  `einrichtung`, sonst Error.

## Test-Setup

Demo-PDF: `ue0/demo-pdfs/demo-antrag-pfarrei-st-albert.pdf` (3.4 KB, FB I-mäßig)

```sql
-- Storage-Upload via Service-Role:
curl -X POST "http://localhost:8000/storage/v1/object/antragseingang-pdf/<path>" \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/pdf" --data-binary @demo.pdf

-- Trigger-Insert:
INSERT INTO apl.antrag_einreichung (storage_path, dateiname, groesse_bytes, erkannter_fb)
VALUES ('2026/05/<uuid>.pdf', 'demo.pdf', 3396, 'I')
RETURNING id;

-- Status pollen:
SELECT id, status, antrag_id, fehler_text FROM apl.antrag_einreichung
ORDER BY eingereicht_am DESC LIMIT 1;
```

## Bekannte Limitierungen & Followups

1. **🔴 BLOCKER für aktuelle Demo: n8n external task runner kaputt.**
   Der separate Container `n8n-task-runner` ist in einem chronischen
   Crash-Loop (`Found runner unresponsive (1/6 … 6/6) → Unresponsive runner
   process was terminated → Waiting for task broker to be ready…`).
   Symptom in n8n: `Task request timed out after 60 seconds` beim zweiten
   Code-Node (`PDF → Base64 + Kontext`).
   Token-Längen stimmen überein (46 Zeichen in beiden Containern), aber
   die Connection wird vom task-runner nicht beibehalten.

   **Quick-Fix-Versuche** (Reihenfolge):
   ```bash
   ssh vps "docker restart n8n-task-runner"
   sleep 30
   ssh vps "docker logs n8n-task-runner --tail=5"
   # Wenn weiter „Found runner unresponsive" → größerer Reset:
   ssh vps "cd /root && docker compose down n8n n8n-task-runner && docker compose up -d n8n n8n-task-runner"
   ```

   **Mittelfristiger Fix** (in docker-compose.yml): `N8N_RUNNERS_MODE=internal`
   setzen (default). Damit laufen Code-Nodes inline im n8n-Container, ohne
   external Runner. Die `n8n-task-runner`-Container kann dann gestoppt
   bleiben. Trade-off: leichtgewichtiger, aber kein Auth-Token-Sandbox.

   **Fallback für Demo morgen**: Workflow funktioniert bis einschließlich
   `Mark in_verarbeitung` + `GET Einreichung-Row` (HTTP-Nodes). Robert kann
   live zeigen:
   - PDF-Upload klappt
   - DB-Trigger feuert
   - n8n bekommt den Webhook (`status: in_verarbeitung`)
   - DB-Inbox-View zeigt Tracking-Eintrag
   
   Die Claude-Vision-Stufe muss als „kommt gleich"-Slide gezeigt werden —
   technisch ist sie da, nur durch den task-runner-Bug blockiert.

2. **n8n-Container braucht 3–10 Minuten** zum sauberen Boot (Database connection
   timed out beim init). Nach jedem Restart ist Geduld nötig — nicht panisch
   nochmal restarten.

3. **PostgREST-Response-Parsing**: n8n's HTTP-Node interpretiert
   `application/vnd.pgrst.object+json` als String statt JSON. Workflow
   verwendet daher `Accept: application/json` + `[0].storage_path`.

4. **Helferliste-Branch (FB II)** ist im Workflow **noch nicht implementiert**.
   Der `extrahiere-helferliste`-Endpoint von `pruefung.butscher.cloud` ist da
   und kann später als zusätzlicher Branch eingehängt werden. Für die VL
   irrelevant.

5. **Klassifikations-Branch** (`erkannter_fb=NULL` → `/api/klassifiziere-pdf`)
   ist im Workflow **nicht** implementiert. Aktuell muss `erkannter_fb`
   bereits vom Upload-Portal gesetzt werden — was es ja tut.

## Demo-Reihenfolge für VL

1. Upload-Portal → PDF auswählen → FB-I → Upload.
2. Status-Page zeigt „wartend" → „in_verarbeitung" → „fertig" (binnen ~30s).
3. UE3-Inbox zeigt den neuen Antrag mit allen FB-I-Feldern.
4. Robert klickt auf den Antrag → sieht extrahierte Werte aus dem PDF.

Falls 4. nicht klappt (Workflow hängt im Claude-Call oder task-runner):
- DB-Snapshot zeigen (`status='in_verarbeitung'`)
- Architektur erklären, dass die Pipeline läuft (CLI-Logs von n8n zeigen).
- Optional: zweite Einreichung manuell forcieren über erneutes Upload.
