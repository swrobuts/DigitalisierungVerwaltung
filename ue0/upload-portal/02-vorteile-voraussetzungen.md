# 02 — Vorteile, Grenzen, Voraussetzungen

## Was diese Stufe gewinnt

| Aspekt | PDF-Mail heute | Upload-Portal UE0 |
|--------|----------------|-------------------|
| Eingangsweg | E-Mail / Brief | strukturierter Upload mit Validierung |
| Erfassungsfehler | hoch (manuelles Abtippen im Amt) | niedrig (Claude Vision liest auch Handschrift zuverlässig) |
| Doppelte Erfassung Bürger ↔ Amt | ja (Bürger schreibt, Amt tippt nach) | nein (KI extrahiert + Bürger bestätigt in UE1) |
| Anlagen vergessen | typisch | Anlage 1 als eigenes optionales Upload-Feld klar markiert |
| Status-Transparenz für Bürger | „warte auf Antwort" | tracking_id + Status-Seite + Auto-Redirect, sobald OCR fertig |
| Akzeptanz | niedrige Hürde — Bürger kennt das PDF schon | gleich niedrig — er muss nichts Neues lernen |
| Reproduzierbarkeit | abhängig von Person im Amt | gleicher KI-Prompt → konsistente Extraktion |
| Datenfluss | Mailserver → Drucker → Akte → Fachverfahren | Storage → KI → DB → UE1 in einem Zug |

## Was diese Stufe nicht löst

- **Bürger braucht weiterhin das PDF** — kann es zwar handschriftlich ausfüllen, muss aber überhaupt erst das Original-Dokument haben
- **Keine Live-Validierung beim Ausfüllen** — Tippfehler in der IBAN merkt der Bürger erst, wenn UE1 das Feld mit dem ausgelesenen Wert zeigt
- **Keine Mehrsprachigkeit beim Ausfüllen** — das PDF ist deutsch (UE1 ist mehrsprachig, kommt also danach)
- **OCR-Restfehler bleiben möglich** — vor allem bei extrem schlechter Handschrift oder beschädigtem Scan. UE1 ist deshalb bewusst der „Kontrolle-und-Korrigieren"-Schritt vor dem finalen Submit.
- **Kein Status-Tracking nach Submit** — die Stufe endet, sobald UE1 übernimmt. Was im Amt passiert, ist Sache von UE2/UE3.
- **Keine semantische Prüfung** des Antrags gegen die Förderrichtlinie (UE3)
- **Keine automatisierte Bescheid-Erstellung** (UE3)

## Voraussetzungen für diese Stufe

### Technisch
- Statisches Webhosting für das Upload-Frontend (GitHub Pages, S3, Nginx)
- Supabase-Instanz mit:
  - Schema `apl2` + Migration `047_ue0_pdf_einreichung.sql` (Tracking-Tabelle + RLS + DB-Trigger)
  - Storage-Bucket `antragseingang-pdf` (private — nur service_role darf read/write)
  - Edge Function `upload-antragspdf` (Deno) deployed
- n8n-Instanz mit dem Workflow aus `supabase/webhooks/n8n-ue0-pdf-ocr.json` aktiv
- API-Keys als **Env-Variablen** am n8n-Container: `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. **Niemals hardcoded** in den Workflow-Nodes — sonst Leak-Risiko beim DB-Export.
- Traefik / Reverse-Proxy mit PathPrefix-Filter auf `/functions/v1/upload-antragspdf` und `/rest/v1/antrag_einreichung` (Status-Polling), Rest 404
- Für GH-Pages-Demo: GitHub-Secrets `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`

### Organisatorisch
- Niemand im Amt muss seinen Prozess umstellen — UE0 endet beim UE1-Prefill, der Output ist derselbe Datensatz, den auch UE1 direkt erzeugen würde
- Demo-PDFs (`ue0/demo-pdfs/`) müssen mit den Werten im seed.sql der Fake-Anträge konsistent gehalten werden, sonst geht der UE3-KI-Vergleich nicht auf
- Bei jeder Änderung des Original-PDFs muss der Claude-Prompt mitgepflegt werden (Feldnamen, Schema)

### Rechtlich
- **Anthropic Claude verarbeitet die PDFs in den USA** — in einer offiziellen Verwaltungs-Anwendung muss man entweder:
  - einen DPF / AVV mit Anthropic abschließen UND eine TIA durchführen, oder
  - auf einen EU-gehosteten Vision-LLM ausweichen (z.B. Mistral Pixtral via Scaleway / AWS Bedrock EU), oder
  - die OCR lokal mit einem self-hosted Modell laufen lassen (z.B. Llama 3.2 Vision via LM Studio — Demo in UE3 verfügbar)
- DSGVO-Pflichten greifen voll, sobald personenbezogene Daten gespeichert werden — auch die Tracking-Tabelle braucht ein Löschkonzept
- Storage-Bucket ist `private` — anon-User kann nach Upload nicht mehr aufs eigene PDF zugreifen. Demo-Hinweis nötig: „Datei wird nach Vorlesungsende gelöscht."
- ANON_KEY ist im Frontend-Bundle sichtbar — die Sicherheit kommt ausschließlich aus RLS + Edge-Function-Validation. SERVICE_ROLE_KEY darf NIEMALS ins Frontend.

### CI-rechtlich
- Demo nutzt eigenes generisches Wappen, **nicht** das offizielle Stadt-Würzburg-Logo
- Disclaimer im Footer macht klar: keine offizielle Stadt-Würzburg-Anwendung
- Optik orientiert sich an wuerzburg.de/formularcenter (Layout, Adresskasten rechts) — gleiche Konvention wie UE1
