# Roadmap-Spec: Innovationsmanagement-Modul „Digitalisierung in der Verwaltung"

**Stand:** 2026-05-17
**Dozent:** Dr. Robert Butscher
**Repo:** https://github.com/swrobuts/DigitalisierungVerwaltung
**Status:** Entwurf zur Freigabe

## 1. Vision

Fünf Unterrichtseinheiten (je 08:15–12:15) zeigen am gleichen konkreten Fallbeispiel **APL 2 — Altentagesstätten, Betriebs- und Personalkostenzuschüsse** der Stadt Würzburg, wie sich die heutige PDF-Welt der Verwaltung in eine moderne, agentische Arbeitswelt überführen lässt.

Pro UE wird **eine Stufe eines Reifegradmodells** als eigenständige, vorführbare Mini-Demo gebaut. Die Studierenden erleben in jeder Stufe **Vorteile**, **Voraussetzungen** und **Grenzen** desselben Antragsprozesses in immer höherer Reife.

Lernziel-Ebene (übergreifend): Studierende können Reifegrade der Verwaltungs­digitalisierung **einordnen**, **bewerten** und im Innovationsmanagement-Kontext **argumentieren**.

## 2. Rahmenbedingungen

| Parameter | Festlegung |
|-----------|-----------|
| Zielgruppe | Studierende **ohne** Entwicklungserfahrung, mit technischem Grundverständnis |
| Anzahl UEs | 5 × 4h (08:15–12:15) |
| Studi-Rolle | UE1–2: **Demo mit kleinem Hands-on-Slot** · UE3–5: **Hands-on** |
| Endprodukt | **5 eigenständige Mini-Demos** (eigene Unterordner pro UE), keine durchgängige App |
| Use Case | APL 2 (Altentagesstätten) durchgängig in allen 5 UEs |
| Rechtsgrundlage | Reformierte Förderrichtlinie AHP (2025-03-27) |
| Repo | swrobuts/DigitalisierungVerwaltung (Mono-Repo, Demo pro Unterordner) |
| IDE / Tools | WebStorm, Git, GitHub |
| Hosting | GitHub Pages für statische UEs · VPS (butscher.cloud Subdomain) für UEs mit Backend |

## 3. Reifegradmodell — 5 Stufen

| UE | Stufe | Inhalt (Slice am APL-2-Antrag) | Stack | Studi-Rolle |
|----|-------|--------------------------------|-------|-------------|
| **1** | Intelligentes Webformular | APL-2-Antrag als HTML-Webform mit Pflichtfeld-Validierung, Anlagen-Upload, Druckansicht. Kein Backend. | Vite + Vanilla TS | Demo + Mini-Hands-on (Regel/Feld ändern) |
| **2** | Persistenter Antrag + Eingangsbestätigung | Antrag in DB, Status-Link, Sachbearbeiter-View, Magic-Link-Auth | Vite + React/Vanilla + Supabase + n8n (Mail) | Demo + Mini-Hands-on |
| **3** | Ontologie-gestützte Plausibilitätsprüfung | Förderrichtlinie als JSON-Schema + Regel-DSL, Antrag wird gegen Norm geprüft, Fehler zitieren Paragraph | Node.js + AJV + JSON-Logic (optional SHACL/JSON-LD) | Hands-on: Regeln erweitern |
| **4** | Wissens-Dialog (RAG, PageIndex-Stil) | Bürger fragt AHP-Förderrichtlinie im Dialog. Doku als thematischer Baum (PageIndex-Ansatz), Agent navigiert statt naivem Chunking | Python FastAPI + Claude API + PageIndex-artiger Doc-Baum | Hands-on: Doc-Baum bauen |
| **5** | Agentische Antragsbearbeitung | LLM-Agent orchestriert Eingang → Vorprüfung (UE3-Regeln) → Wissens-Lookup (UE4) → Rückfrage / Bescheid-Entwurf. Human-in-the-loop | n8n + Claude API + Anbindung an UE2-DB | Hands-on in Gruppen |

**Bewusst eigenständig:** Jede UE-Demo ist isoliert lauffähig. Konzeptionelle Bezüge ja, Code-Bezüge nein. Daher Stack-Wechsel pro UE explizit erlaubt.

## 4. Repo-Struktur

```
DigitalisierungVerwaltung/
├─ README.md                           # Kurs-Übersicht, Reifegradmodell, Navigation
├─ docs/
│  ├─ konzept.md                       # Pädagogisches Konzept, Reifegradmodell
│  ├─ fallbeispiel.md                  # APL 2 Altentagesstätte erklärt
│  ├─ rechtsgrundlage.md               # Förderrichtlinie AHP destilliert
│  └─ superpowers/specs/               # Diesen Spec + spätere
├─ materialien/                        # Original-PDFs — geteilt über alle 5 UEs
│  ├─ antrag-apl2.pdf
│  ├─ anlage-antrag-apl2.pdf
│  └─ foerderrichtlinie-ahp-2025-03-27.pdf
├─ ue1/
│  ├─ folien/                          # UE-spezifische PPT
│  └─ webformular/                     # UE-Demo (Vite/TS-Projekt)
├─ ue2/
│  ├─ folien/
│  └─ persistenz/
├─ ue3/
│  ├─ folien/
│  └─ ontologie/
├─ ue4/
│  ├─ folien/
│  └─ rag-pageindex/
├─ ue5/
│  ├─ folien/
│  └─ agent/
└─ .github/workflows/                  # Lint, Tests, Deploy-Hooks pro UE
```

**Strukturprinzip:** Pro UE ein Top-Level-Ordner `ueN/`. `materialien/` bleibt Top-Level, weil alle 5 UEs denselben Fall (APL 2) bearbeiten — der Antrag wird aus jeder UE referenziert via `../../materialien/`.

## 5. Doku-Konvention pro UE (gilt für jeden `ueN-…`-Ordner)

Genau 4 Markdown-Dateien plus `src/`:

| Datei | Inhalt |
|-------|--------|
| `README.md` | Was die Stufe ist · Quickstart (`npm install && npm run dev`) · Demo-Link |
| `01-konzept.md` | Warum diese Stufe + Konzept-Skizze (Mermaid) |
| `02-vorteile-voraussetzungen.md` | Nutzen + Grenzen + technische / organisatorische / rechtliche Voraussetzungen |
| `03-walkthrough.md` | Schritt-für-Schritt-Erklärung des Codes + Mitmach-Aufgabe (ab UE3) |

## 6. UE1 im Detail

### Lernziele
Studierende können …
- den Status quo der Verwaltungsdigitalisierung **einordnen** (über die PPT)
- die **Schwachstellen eines PDF-Antrags** am Fall APL 2 **benennen**
- erklären, **was ein intelligentes Webformular leistet — und was nicht**

### Zeitplan
| Zeit | Block | Inhalt |
|------|-------|--------|
| 08:15–08:30 | Auftakt | Begrüßung, Lernziele, Roadmap, Repo-Tour |
| 08:30–09:45 | PPT-Block | `IntroDigitalisierungVerwaltung.pptx` durchgehen |
| 09:45–10:00 | Fallbeispiel | Original-PDFs zeigen, „Würdet ihr das ausfüllen?" |
| 10:00–10:30 | Pause | |
| 10:30–10:50 | Murmelgruppen | „Was ist schlecht am PDF-Prozess?" → Sammeln |
| 10:50–11:45 | Demo-Build | Webform live + Walkthrough im WebStorm |
| 11:45–12:10 | **Hands-on-Slot** | Studis ändern Regel/Feld/Pflichtstatus (siehe unten) |
| 12:10–12:15 | Wrap-up | Cliffhanger UE2: „Was passiert nach dem Absenden?" |

### Was gebaut wird in `ue1/webformular/src/`

Stack: **Vite + Vanilla TS** (kein React-Overhead, minimale Schwelle).

- `index.html` — APL-2-Antrag in modernem Layout (Pflichtfelder markiert, Hilfetexte)
- `validation.ts` — HTML5 + Cross-Field-Rules (z.B. „Antragsdatum ≤ heute", IBAN-Prüfziffer, mindestens eine Anlage)
- `attachments.ts` — File-Upload mit Dateityp- und Größenprüfung, Vorschau
- `submit.ts` — Bestätigungsseite mit clientseitig generierter Antragsnummer (kein Backend)
- `print.css` — Druckansicht für Akte

**Bewusste Beschränkungen** (motivieren UE2/3):
- Kein Backend → Daten weg beim Tab-Schließen
- Keine Eingangsbestätigung per Mail
- Keine semantische Prüfung gegen die Förderrichtlinie

### Hands-on-Mini-Aufgabe (11:45–12:10)
Studis wählen eine von drei niederschwelligen Aufgaben:
1. **Validierungsregel ergänzen**: „Antragsdatum nicht vor Förderzeitraum-Beginn" (5–10 Zeilen)
2. **Pflichtfeld umstellen**: Optional-Feld zu Pflicht machen + Hilfetext
3. **Feld hinzufügen**: „Mobil-Telefon" mit Pattern-Validierung

**Zwei Setup-Pfade**:
- **Lokal**: `git clone` + `npm install` + `npm run dev`
- **In-Browser**: **StackBlitz**-Link im README (zero install)

### Vorbereitung
- **Studis vor UE1**: Förderrichtlinie 15 Min überfliegen, PDFs öffnen
- **Dozent vor UE1**: `ue1/webformular/` ist **vorab fertig committed**. Live nur Walkthrough, nicht „from scratch"

## 7. UEs 2–5 (Skizze, Detail-Specs später)

Pro UE wird **vor der Veranstaltung** ein eigener Mini-Spec + Implementation-Plan erstellt. Diese Roadmap-Spec liefert nur die Skizze. Detail-Specs folgen pro UE, wenn sie dran sind.

**UE2 — Persistenz**
- Datenmodell für APL-2-Anträge in Supabase
- Magic-Link-Auth für Antragsteller (analog LVE-Cockpit-Pattern)
- Sachbearbeiter-View (Inbox)
- n8n-Workflow für Eingangsbestätigungs-Mail
- DSGVO-Kasten in Doku: Was müsste in Echt passieren (AVV, Löschkonzept, Hosting in DE)

**UE3 — Ontologie**
- Förderrichtlinie destilliert: Antragsberechtigung, Förderhöhen, Antragsfristen, Nachweispflichten
- Modellierung als JSON-Schema + JSON-Logic-Regeln
- Antrag wird gegen Regeln geprüft, Fehler zeigen Paragraph
- Hands-on: Studis ergänzen 2 eigene Regeln
- Diskussion: Wer pflegt die Regeln? Versionierung? Juristen-Akzeptanz?

**UE4 — RAG / PageIndex**
- Erläuterung naives Chunking vs. PageIndex-Ansatz (siehe Golem-Artikel)
- AHP-Förderrichtlinie als thematischer Baum modellieren
- Dialog-Frontend für Bürger-Fragen mit Paragraph-Zitation
- Hands-on: Studis bauen Teilbäume
- Diskussion: Halluzinationsrisiko, Zitierpflicht, Pflege

**UE5 — Agent**
- n8n-Workflow: Eingang → Vorprüfung (UE3-Regeln) → Wissens-Lookup (UE4) → Rückfrage / Bescheid-Entwurf
- Human-in-the-loop bleibt zwingend
- Hands-on in Gruppen: jede Gruppe definiert einen Workflow-Schritt
- Diskussion: Verantwortlichkeit, Audit-Trail, Datenschutz-Folgenabschätzung

## 8. Querschnitts-Hygiene

### Setup
- `.nvmrc` im Repo-Root
- Pro Hands-on-UE einen StackBlitz-Link als Fallback
- Codespaces-Devcontainer als Goldstandard

### Datenschutz
- Echte personenbezogene Daten nie verwenden
- Ab UE2 DSGVO-Kasten in jeder UE-Doku
- UE5 mit Folgenabschätzungs-Snippet

### Live-Coding-Risiko
- Alle Demos vorab fertig committed
- Live nur Walkthrough + die Hands-on-Diffs

### OneDrive-Hygiene (Repo liegt in OneDrive)
- `.git/` und `node_modules/` aus OneDrive-Sync ausschließen (OneDrive-Settings)
- Nur an einem Gerät arbeiten, sonst Repo lokal nach `~/GitHub/` umziehen
- Bei sporadischen git-Fehlern: OneDrive kurz pausieren

### Mehrsprachigkeit & Integration (Querschnitt ab UE1)

Verwaltungs-Webformulare in DE-Städten richten sich an eine sprachlich vielfältige Bevölkerung. Als didaktischer Integrations-Aspekt werden die UE-Demos **mehrsprachig** angelegt: ab UE1 Deutsch + Italienisch + Türkisch + Spanisch — zunächst nur Labels, um die Architektur zu zeigen, ohne die Komplexität juristischer Volltext-Übersetzungen aufzumachen. Übersetzungen in den Demos sind als „Demo-Übersetzungen, in Produktion durch Fachübersetzer zu prüfen" gekennzeichnet. Spätere UEs können auf das gleiche i18n-Pattern aufsetzen.

### Corporate Identity Stadt Würzburg (Querschnitt ab UE1)

Die Demos sind optisch an der CI der Stadt Würzburg orientiert: Würzburg-Rot (`#BE1E28` als plausibler Wert, exakter CI-Hex nicht öffentlich), heraldisches Gold (`#F2A900`), Schrift Spectral als Free-Analogon zum proprietären Linotype Finnegan. **Logo / Signet wird NICHT eingebunden** — dessen Nutzung erfordert Genehmigung der Pressestelle (`pressestelle@stadt.wuerzburg.de`). Stattdessen Wortmarke „Stadt Würzburg" + klarer Disclaimer im Footer („kein offizielles Angebot der Stadt Würzburg").

**Schrems-II-Hinweis:** Google Fonts werden in den Demos via CDN eingebunden — das ist nur für Lehr-Demo akzeptabel. In Produktion wären Self-Hosting der Fonts und ein Verzicht auf jede US-Drittanbieter-Verbindung Pflicht. In jeder UE-Doku (`02-vorteile-voraussetzungen.md`) wird das explizit als rechtliche Voraussetzung markiert.

## 9. Vorgehen / Schrittweise Umsetzung

Strikte Sequenz mit Feedback-Gates:
```
Roadmap-Spec freigeben (= dieses Dokument)
  → UE1 Mini-Spec + Plan + bauen → Review → UE1 halten
  → UE2 Mini-Spec + Plan + bauen → Review → UE2 halten
  → … bis UE5
```

Jede UE bekommt vor ihrer Veranstaltung einen **eigenen Mini-Spec + Implementation-Plan**. Diese Roadmap ist nur die Rahmenfreigabe.

## 10. Entscheidungen (Stand 2026-05-17, nach Spec-Review)

| # | Punkt | Entscheidung |
|---|-------|--------------|
| O1 | **Bewertungsform** | **Reine Lehre, keine Abgabe.** Studis besuchen, diskutieren mit, nutzen die Doku zum Nach-Lernen. |
| O2 | **LLM-Provider** (UE4/5) | **Claude API.** Robert hat Konten und Workflow-Erfahrung. |
| O3 | **UE5-Plan-B** | **Kein Plan B nötig — Hands-on-Agent ist gesetzt.** UE5 wird in Gruppen gebaut, jede Gruppe definiert einen Workflow-Schritt. Risiko wird im UE5-Mini-Spec adressiert (Boilerplate-Tiefe, Zeitfenster). |
| O4 | **Hosting-Strategie** | **OK wie vorgeschlagen.** GitHub Pages für statische UEs (UE1, ggf. UE3), Subdomain auf butscher.cloud für UE2/4/5. Genaue Subdomain-Namen pro UE-Mini-Spec. |
| O5 | **Studi-Setup** | **Noch offen** — wird im UE1-Mini-Spec konkretisiert (StackBlitz vs. lokal vs. Codespaces). |

## 11. Nicht im Scope

- Keine durchgängige Produktiv-App (5 eigenständige Demos)
- Keine echte BundID-Integration (nur Skizze in UE2)
- Kein Multi-Tenant-Mandanten-Konzept (Würzburg bleibt einziger Fake-Mandant)
- Keine vollständige Förderrichtlinien-Ontologie (nur ein didaktischer Ausschnitt)

## 12. Akzeptanzkriterien Roadmap-Spec

- [x] User hat O1–O4 entschieden; O5 explizit auf UE1-Mini-Spec verschoben
- [x] User hat Repo-Struktur freigegeben
- [x] User hat UE1-Detail freigegeben (Hands-on-Mini-Slot integriert)
- [x] Spec ist im Repo committed
- [x] Nächster Schritt definiert: UE1 Mini-Spec + Implementation-Plan via writing-plans
