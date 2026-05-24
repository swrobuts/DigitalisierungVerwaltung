# UE3 — KI-Sachbearbeitung (`ki.butscher.cloud`)

> **Reifegradstufe 3:** Die KI prüft den Antrag eigenständig gegen die Förderrichtlinie, schlägt eine Entscheidung mit Begründung vor und entwirft den Bescheid. Der Sachbearbeitende bleibt entscheidungsbefugt (Human-in-the-Loop) und kann jeden KI-Vorschlag overrulen — jedes Override wird getrackt und im Compliance-Cockpit sichtbar.

## Was diese Stufe gegenüber UE2 gewinnt

- **KI-Erstprüfung** mit Begründung pro AHP-Norm: Doctree-Subsumtion + JSON-strukturiertes Ergebnis
- **Adversarieller Zweitprüfer** (zweites LLM mit Gegen-Prompt) + Dissens-Berechnung → vergleichbar mit dem 4-Augen-Prinzip im Amt
- **Vorjahresvergleich**: KI ruft den Vorjahresantrag, vergleicht Bemessungs- und Kostengrößen, weist auf Sprünge hin
- **Risiko-Score** pro Antrag (heuristisch) → Inbox-Sortierung nach Risiko
- **Externe Validierung** via Perplexity-Recherche (Träger, Verein, Steuer-Status)
- **Quellen-Validator**: prüft, ob jeder zitierte Paragraph im Bescheid wirklich im Doctree existiert — Halluzinations-Schutz
- **Bescheid-Render** als PDF (Jinja-Template + WeasyPrint)
- **Override-Tracking + Adoption-Dashboard**: jede Sachbearbeiter-Korrektur wird gespeichert → Lern-Telemetrie
- **Compliance-Cockpit** (AI Act Art. 50): Transparenz-Hinweis im Bescheid, Aufsichts-Metriken, Regelkatalog Stufe A aktiv/inaktiv-Toggle
- **LM Studio als lokaler LLM-Provider** wählbar (Datenschutz-Option neben Anthropic)

## Stack

- Frontend: Vite 6, React 19, Tailwind 4, TypeScript 5, react-router-dom 7
- Backend: **FastAPI** (`pruefung/`) — Python 3.12, uv, Anthropic SDK, Voyage Embeddings, Perplexity
- Auth + DB: Supabase Magic-Link gegen Self-hosted Supabase
- KI: Claude Sonnet 4.5 (primary), Claude Opus (Zweitprüfer), Perplexity (extern), Voyage 3 (Embeddings); optional LM Studio (lokal)
- Tests: Vitest 2 + Testing Library (Frontend); pytest + httpx (Backend)
- Deployment: Docker Multi-Stage → Nginx-Unprivileged → Traefik (Frontend); Uvicorn-Container hinter Traefik (Backend)

## Schnellstart (lokal, gegen die geteilte Supabase)

```bash
git clone https://github.com/swrobuts/DigitalisierungVerwaltung.git

# Frontend
cd DigitalisierungVerwaltung/ue3/sachbearbeitung-ki
cp .env.example .env.local   # VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY + VITE_PRUEFUNG_API
npm install && npm run dev   # http://localhost:5175
npm test                     # ~120 Tests

# Backend (in zweitem Terminal)
cd ../../pruefung
uv sync
cp .env.example .env         # ANTHROPIC_API_KEY + PERPLEXITY_API_KEY + VOYAGE_API_KEY + SUPABASE_SERVICE_ROLE_KEY
uv run uvicorn pruefung.main:app --reload --port 8001
```

## Doku

- **Roadmap-Spec:** [`docs/superpowers/specs/2026-05-17-roadmap-5-ue-digitalisierung-verwaltung.md`](../../docs/superpowers/specs/2026-05-17-roadmap-5-ue-digitalisierung-verwaltung.md)
- **UE3 Spec (Erstprüfung):** [`docs/superpowers/specs/2026-05-22-ue3-ki-pruefung-design.md`](../../docs/superpowers/specs/2026-05-22-ue3-ki-pruefung-design.md)
- **UE3 Erweiterungen (Zweitprüfung, Vergleich, Risiko, extern):** [`docs/superpowers/specs/2026-05-23-ue3-zweitpruefung-und-erweiterungen-design.md`](../../docs/superpowers/specs/2026-05-23-ue3-zweitpruefung-und-erweiterungen-design.md)
- **Implementation-Plan:** [`docs/superpowers/plans/2026-05-22-ue3-ki-pruefung.md`](../../docs/superpowers/plans/2026-05-22-ue3-ki-pruefung.md)
- **Doctree / Förderrichtlinie strukturiert:** `apl2.norm_section` + `apl2.norm_statement` (Migrationen 029–049)
- **Backend-Module:** `pruefung/src/pruefung/` — `bescheid_subsumtion`, `zweitpruefer_ki`, `dissens`, `vergleich_vorjahr`, `risiko_score`, `extern_validierung`, `quellen_validator`, `compliance`, `adoption_metrics`, `llm_client`, `doctree_navigate`, `pdf_render`
- **Frontend-Pages:** `Inbox`, `AntragDetail`, `ComplianceStatus`, `AdoptionDashboard`, `AhpInspector`, `NormStatementsInspector`, `OntologieInspector`

## Demo

https://ki.butscher.cloud · Login mit freigeschalteter Adresse (Allowlist in `apl2.allow_email`).

API-Backend: https://pruefung.butscher.cloud (OpenAPI-Doku auf `/docs`).

## Hands-on-Aufgabe für Studierende

**Aufgabe A — Neue Norm-Regel + KI-Prüfung**

1. Im SQL-Editor eine neue `apl2.norm_statement`-Zeile einfügen (z.B. „Antrag muss bis 1. April vorliegen — sonst Verfristung"). Refs auf §3.3 setzen.
2. Im Frontend (`NormStatementsInspector`-Page) prüfen, ob die Regel erscheint.
3. Einen Fake-Antrag mit `antragsdatum > 1.4.` einreichen.
4. KI-Prüfung anstoßen → schaut die KI die neue Regel?
5. Diskussion: Wie verhindert man Regelflut? Wer pflegt die Norm-Statements? Was passiert bei Richtlinienänderung mitten im Haushaltsjahr?

**Aufgabe B — LM Studio als lokaler Provider**

1. LM Studio auf eigenem Rechner installieren, `llama-3.1-70b` o.ä. laden.
2. `pruefung/.env`: `LLM_PROVIDER=lmstudio` + `LMSTUDIO_BASE_URL=http://host.docker.internal:1234/v1`.
3. Backend neu starten, denselben Antrag prüfen.
4. Vergleich: Wie unterscheidet sich die Begründung Cloud vs. lokal? Welche Datenflüsse fallen weg?
5. Diskussion: Wann ist „Cloud-LLM raus" datenschutzrechtlich notwendig? Wann reicht ein AVV?

**Aufgabe C — Override-Adoption-Dashboard lesen**

1. Eigen-Login → AdoptionDashboard öffnen.
2. Auswerten: Welche KI-Vorschläge werden am häufigsten überstimmt?
3. Daraus eine **operationale Konsequenz** ableiten — wie würdet ihr Prompt oder Regel anpassen?
