# 03 — Code-Walkthrough & Mitmach-Aufgabe

## Code-Tour (für die Stunde)

UE3 ist die komplexeste Stufe — wir gehen sechs Stellen zusammen durch, zwei davon im Backend, vier im Frontend. Roter Faden: **wie kommt eine KI-Empfehlung sicher beim Sachbearbeiter an, ohne dass jemand etwas blind übernimmt?**

1. **`pruefung/src/pruefung/bescheid_subsumtion.py`** — Die Erst-KI. Schauen wir uns an, wie der Prompt strukturiert ist: System-Prompt mit Rollendefinition („Du bist Sachbearbeiter-Assistent"), Doctree-Auszug der einschlägigen Paragraphen (nicht die ganze Richtlinie — gezielt navigiert), Antragsdaten als JSON, Output-Schema-Forcing („Antworte ausschließlich als JSON mit dieser Struktur"). **Lehrreich**: Wir sehen `doctree_navigate.py` in Aktion — semantische Suche mit Voyage-Embeddings statt naivem Chunking. (PageIndex-Pattern.)

2. **`pruefung/src/pruefung/zweitpruefer_ki.py`** — Der Adversarielle. Bekommt **denselben** Antrag + **das Erst-Ergebnis** + einen Gegen-Prompt: „Finde drei Gründe, warum die Erstprüfung in jedem Paragraph falsch sein könnte." Vergleich der beiden Outputs erfolgt in **`dissens.py`**, das die Cluster `konsens / inhaltlich_unterschiedlich / gegensätzlich` berechnet. **Diskussionsstelle**: Ist „zwei Mal Claude" wirklich 4 Augen? Was ist mit Modell-Bias-Korrelation?

3. **`pruefung/src/pruefung/quellen_validator.py`** — Der Halluzinations-Schutz. Vor dem Bescheid-Render werden alle zitierten `§ 2.3.4`-Refs gegen `apl2.norm_statement.ref` geprüft. Existiert die Referenz nicht, wird der Satz gefiltert und ein Warning geloggt. **Wichtige Stelle für die Vorlesung**: das ist der Grund, warum strukturierte Doctrees besser sind als naives RAG-on-PDF.

4. **`ue3/src/pages/AntragDetail.tsx`** — Die zentrale Sicht. Zeigt PruefungsCard, ZweitpruefungsCard mit Dissens-Visualisierung, VorjahresVergleich (Delta-Bars), ExterneValidierungCard mit zitierten Quellen, BescheideListe. **Jede Card hat einen `Übernehmen`-Button** — die Klick-Aktion landet in `apl2.ki_override` mit `original_vorschlag` + `final_entscheidung`, basis für das Adoption-Dashboard.

5. **`ue3/src/pages/AdoptionDashboard.tsx`** — Die Lern-Telemetrie. Zeigt: Welche KI-Empfehlungen werden am häufigsten overruled? Pro Paragraph, pro Sachbearbeitendem (anonymisiert), pro Antragstyp. **Anti-Pattern**: Wenn Adoption 100% ist, ist das **nicht** gut — heißt blinde Übernahme. Wenn Adoption 0% ist, ist die KI nutzlos. Zielband irgendwo dazwischen, kontextabhängig.

6. **`ue3/src/pages/ComplianceStatus.tsx`** — Das Compliance-Cockpit. Tabs für „Aufsichts-Metriken" (Adoption-Quote, Dissens-Häufigkeit, Bescheid-Renderzeit), „Regelkatalog Stufe A" (Toggle-Liste der aktivierten Norm-Statements), „KI-Provider" (Anthropic vs. LM Studio, Cost-Tracking). **AI-Act-relevant**: Hier zeigen wir der Aufsichtsbehörde, dass wir wissen, was unsere KI tut.

## Mitmach-Aufgabe (Hands-on, ganztägig)

UE3 ist **Hands-on**, kein Demo-mit-kleinem-Slot. Sucht euch eine Aufgabe.

### Aufgabe A — Neue Norm-Regel + KI-Prüfung durchspielen

1. **SQL**: Neue Zeile in `apl2.norm_statement` einfügen:
   ```sql
   insert into apl2.norm_statement (ref, aussage, statement_typ, layer, aktiv)
   values ('§3.3', 'Anträge müssen bis zum 1. April des Antragsjahres vorliegen — sonst Verfristung.',
           'pflicht', 'A', true);
   ```
2. **Embedding generieren**: `uv run python -m pruefung.voyage_embed --statement-id <id>` (oder bei laufendem Backend automatisch)
3. **NormStatementsInspector-Page** öffnen, prüfen ob die Regel erscheint
4. Einen Fake-Antrag mit `antragsdatum > 1.4.<jahr>` einreichen
5. Im AntragDetail die Erst-Prüfung anstoßen → erscheint die neue Regel in der Begründung?
6. **Diskussion**: Wie verhindert man Regelflut? Wer pflegt die Norm-Statements bei Richtlinien-Änderung mitten im Haushaltsjahr?

### Aufgabe B — LM Studio als lokaler LLM-Provider

1. LM Studio auf eigenem Rechner installieren, ein 70B-Modell laden (z.B. `llama-3.1-70b-instruct` oder `qwen2.5-72b`)
2. `pruefung/.env`: `LLM_PROVIDER=lmstudio` + `LMSTUDIO_BASE_URL=http://host.docker.internal:1234/v1` (oder VPS-IP)
3. Backend-Container neu starten
4. Denselben Antrag zweimal prüfen — einmal Anthropic, einmal LM Studio
5. **Vergleich**: Wie unterscheiden sich Argumentation, Knappheit, Halluzinations-Rate?
6. **Cost-Tracking**: was kostet Anthropic-Cloud-Prüfung vs. LM-Studio-Strom?
7. **Diskussion**: Wann ist „Cloud-LLM raus" rechtlich notwendig (Drittstaatenübermittlung, Kategorien personenbezogener Daten)? Wann reicht ein AVV mit Anthropic?

### Aufgabe C — Adoption-Dashboard interpretieren

Ohne Code, mit Daten:

1. Eigen-Login → AdoptionDashboard öffnen
2. Identifiziert die drei am häufigsten overruled KI-Empfehlungen
3. Schaut euch deren Begründungstexte an (in `apl2.ki_override.original_vorschlag`)
4. Was ist das Muster? Falsche Regel-Auswahl? Halluzinierte Zahlen? Zu lasche Interpretation?
5. **Operationale Konsequenz**: Wie würdet ihr Prompt, Norm-Statement oder UI ändern, damit weniger Overrides nötig sind?
6. **Anti-Diskussion**: Wäre eine Adoption-Quote von 100% wirklich besser?

### Aufgabe D — Externe Validierung erweitern

1. Aktuell prüft `extern_validierung.py` nur den Trägernamen via Perplexity
2. Erweitert es um eine **zweite externe Quelle**: z.B. Vereinsregister-Auszug per Web-Scrape (DGVZ-Suche oder Vereinsregister-Online der zuständigen Amtsgerichte)
3. Quellen-URLs validieren (HTTP 200, Inhalt enthält Trägernamen)
4. Im Frontend `ExterneValidierungCard` die neue Quelle anzeigen
5. **Diskussion**: Wenn Träger im Vereinsregister steht aber Perplexity nichts findet — was tut die KI? Was tut der Mensch?

### Aufgabe E — Bescheid-Template anpassen

1. `pruefung/src/pruefung/templates/bescheid_*.html.j2` öffnen
2. Den Transparenz-Hinweis (AI-Act-Pflicht) prominenter machen — z.B. in einen eigenen Block
3. Neue Version rendern: `POST /api/antrag/<id>/render-bescheid`
4. PDF herunterladen, prüfen ob der Hinweis im Footer steht UND ein eigener „Hinweis zur KI-Nutzung"-Absatz oben im Bescheid
5. **Diskussion**: Wie viel KI-Transparenz ist zu viel? Wann wirkt der Hinweis abschreckend, wann beruhigend für den Bürger?

## Hinweis zum Ablauf

- **Eigene Supabase ist hier nicht praktikabel** — der Doctree + Embeddings + Migrations 029–049+ sind zu aufwendig zum Aufsetzen für einen Vorlesungstag. Nutzt die geteilte VPS-Instanz mit eurem Allowlist-Login.
- Wer alle Aufgaben durchhat: zieht eine echte API-Doku auf via `https://pruefung.butscher.cloud/docs` (FastAPI Auto-OpenAPI) und probiert eigene Endpoint-Aufrufe per `curl`.
