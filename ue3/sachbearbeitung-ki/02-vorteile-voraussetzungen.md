# 02 — Vorteile, Grenzen, Voraussetzungen

## Was diese Stufe gewinnt

| Aspekt | Sachbearbeitung mit UE2 | KI-Sachbearbeitung UE3 |
|--------|--------------------------|--------------------------|
| Fachliche Prüfung | Mensch liest 35-seitige Richtlinie und 8-seitigen Antrag | KI extrahiert pro Paragraph eine begründete Bewertung, Mensch reviewed |
| 4-Augen-Prinzip | zweite Person, falls verfügbar | adversarielle Zweit-KI mit Gegen-Prompt, immer verfügbar |
| Vorjahresvergleich | Akten holen, manuell vergleichen | automatisch berechnete Deltas mit Sprung-Indikatoren |
| Risiko-Priorisierung | nach Eingangsreihenfolge | Inbox sortiert nach Risiko-Score; Hochrisiko-Fälle zuerst |
| Träger-Recherche | googeln + Vereinsregister online | Perplexity-Search mit zitierten Quellen, programmatisch validiert |
| Bescheid-Schreiben | Word, eigene Argumentation | Jinja-Template + KI-generierter Begründungstext, juristisch konsistent |
| Halluzinations-Schutz | n/a | Quellen-Validator filtert erfundene Paragraphen vor dem Render |
| Datenschutz-Optionen | n/a | Anthropic Cloud ODER LM Studio lokal (Datenfluss bleibt im Amt) |
| Aufsichts-Sichtbarkeit | manuelle Stichprobenkontrolle | Compliance-Cockpit mit Adoption-Quote, Dissens-Häufigkeit, AI-Act-Transparenz |
| Lerneffekt | Mensch sieht eigene Fehler nur durch Beschwerden | Adoption-Dashboard zeigt, wo KI systematisch overruled wird → Prompt-Anpassung möglich |

## Was diese Stufe nicht löst

- **Kein vollautomatischer Bescheid-Versand** — die Demo stoppt beim PDF-Render, der Mensch unterschreibt und versendet
- **Keine vollagentische Bearbeitung** (Eingang → Vorprüfung → Wissens-Lookup → Bescheid in einem Zug) — das wäre Reifegradstufe 4
- **Kein Bürger-Dialog** — der Bürger kann keine Rückfragen stellen oder mit der KI über seinen Antrag sprechen (Reifegrad-Erweiterung Richtung Chatbot)
- **Keine SHACL / formale Ontologie-Schließung** — die Förderrichtlinie ist als Doctree + atomare Statements modelliert, nicht als RDF-Graph. Reicht für die Demo; für höhere Verbindlichkeit ggf. SHACL nachrüsten.
- **KI-Vorschläge sind nicht rechtsverbindlich** — der Sachbearbeitende bleibt formaler Bescheid-Geber. Keine Genehmigung durch KI allein.
- **Begrenzte Tests gegen Edge-Cases** — Demo hat etwa 120 Tests, deckt aber nicht alle erdenklichen Antragskonstellationen ab; produktive Einsätze würden Property-Based-Testing brauchen

## Voraussetzungen für diese Stufe

### Technisch
- Alles aus UE2 plus:
- **Backend-Hosting** (Container für FastAPI / Uvicorn), Traefik-Subdomain (Demo: `pruefung.butscher.cloud`)
- **API-Keys** als Container-Env: `ANTHROPIC_API_KEY`, `PERPLEXITY_API_KEY`, `VOYAGE_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **Strukturierte Förderrichtlinie** in `apl2.norm_section` + `apl2.norm_statement` gepflegt (Migration 029 ff., insbesondere 049 + Phase-1.x-Updates)
- **Embeddings** für Doctree-Navigation: einmalig `voyage_embed.py` durchlaufen lassen, danach inkrementell
- **Templates** für Bescheid-Render unter `pruefung/src/pruefung/templates/`
- **Optional LM Studio** auf dem VPS oder Sachbearbeiter-Rechner für lokales LLM (Datenschutz-Modus)

### Organisatorisch
- **Klare Rollenverteilung KI vs. Mensch** schriftlich fixieren: KI schlägt vor, Mensch entscheidet — und zwar pro Antrag dokumentiert
- **Schulung der Sachbearbeitenden** zum kritischen Umgang mit KI-Vorschlägen (Adoption-Dashboard hilft beim Erkennen blinder Übernahme)
- **Override-Politik** definieren: welche KI-Empfehlungen werden grundsätzlich nochmal manuell geprüft (z.B. Bewilligung > X €)
- **Norm-Pflege**: bei jeder Richtlinien-Änderung müssen `norm_section` + `norm_statement` nachgezogen werden, sonst weicht KI von tatsächlicher Rechtslage ab
- **Bescheid-Vorlage** muss vom Justitiariat freigegeben sein — der Text ist eine offizielle Verwaltungsentscheidung

### Rechtlich
- **AI Act Art. 50**: Transparenz-Pflicht — der Bescheid muss kenntlich machen, dass KI genutzt wurde. In der Demo: Footer-Hinweis im PDF-Template.
- **AI Act Art. 6 + Anhang III**: Verwaltungsentscheidungen mit Auswirkung auf Sozialleistungen sind voraussichtlich Hochrisiko-KI — formale Conformity-Bewertung, Datenmanagement, Logging, menschliche Aufsicht nötig (Demo deckt Logging + Aufsicht ab, Conformity-Bewertung wäre Produktiv-Schritt)
- **DSGVO Art. 22** — Verbot vollautomatisierter Einzelentscheidungen. Human-in-the-Loop-Architektur ist nicht optional, sondern rechtliche Pflicht.
- **Externe LLMs in den USA**: Anthropic-Cloud nur mit gültigem DPF + Übermittlungs-Folgenabschätzung. Alternative: LM Studio lokal — keine Datenübermittlung in Drittstaaten.
- **Perplexity-Recherche**: liefert externe Daten (Vereinsregister-Auszüge etc.). Sicherstellen, dass keine personenbezogenen Daten des Antragstellers an Perplexity gehen — die Demo schickt nur den Träger-Namen.
- **Adoption-Tracking** ist DSGVO-konform (zweck: Qualitätssicherung der KI), braucht aber im Verarbeitungsverzeichnis einen Eintrag

### Sicherheits-Härtung
- **Service-Role-Key** des Backend-Containers NIE im Frontend bündeln
- **Backend authentifiziert sich gegenüber Supabase per Service-Role**, prüft aber via Header den eingeloggten Sachbearbeiter (Forwarded-JWT-Pattern) → keine Backdoor zur DB ohne Login
- **Rate-Limits** im Backend auf alle LLM-Endpoints (Cost-Schutz + DoS-Schutz)
- **Cost-Tracking** im `llm_client.py` macht Ausreißer-Antraege sichtbar (große PDFs, Token-Explosionen)
