# Slide-Template für alle UEs (Reifegradstufen 0-4)

> **Zweck:** Einheitliches didaktisches Schema für alle UE-`slides.md`.
> Jede UE folgt der gleichen 17-Slide-Sequenz, sodass eine KI
> daraus konsistente PowerPoints ableiten kann.

## Marp-Header (identisch für jede UE)

```yaml
---
marp: true
theme: default
paginate: true
header: "UE<N> · <Titel> · Reifegradstufe <N>"
footer: "Fallstudie AHP Würzburg · Dr. Robert Butscher · THWS"
style: |
  section { font-family: 'Inter', system-ui, sans-serif; }
  h1, h2, h3 { color: #4A4A4A; }
  .accent { color: #AD0E36; font-weight: 600; }
  .pill { display: inline-block; padding: 4px 12px; border-radius: 999px;
          background: #AD0E36; color: white; font-size: 14px;
          letter-spacing: 0.06em; font-weight: 600; }
  blockquote { border-left: 4px solid #AD0E36; background: #FBE9EE;
               padding: 12px 20px; }
---
```

## 17-Slide-Sequenz

| # | Slide | H2-Titel | Zweck |
|---|---|---|---|
| 1 | **Cover** | (lead-Slide, kein H2) | Pill „REIFEGRADSTUFE N" + Titel + 1-Satz-Tagline + Speaker-Footer |
| 2 | **Lernziele** | `## Lernziele` | 4 Bullets: Wissen / Verstehen / Anwenden / Beurteilen |
| 3 | **Ausgangslage** | `## Ausgangslage — …` | Status quo aus Vorgänger-UE / Welt vor dieser Stufe |
| 4 | **Problemstellung** | `## Problemstellung` | Tabelle Schmerzpunkt ↔ Wirkung + Block-Quote „Kernproblem" |
| 5 | **Reifegradmodell** | `## Reifegradmodell — wo wir stehen` | 5-Zeilen-Tabelle UE0–UE4 mit Bürger/Amt-Aufwand, aktuelle Zeile **fett** |
| 6 | **Herangehensweise** | `## Herangehensweise` | Lösungsidee als nummerierte Liste 1-6 + Block-Quote „Kernidee" |
| 7 | **Architektur** | `## Architektur` | ASCII-Diagramm in Code-Block, Datenfluss top-down |
| 8 | **Kern-Mechanismus** | `## Kern-Mechanismus — …` | Code-Snippet (10-15 Z.) + 2-3 Bullets Erläuterung |
| 9 | **Live-Demo** | `## Live-Demo` | URL bold + 5-7 Schritt-Anleitung + Speaker-Note |
| 10 | **Chancen** | `## Chancen` | 6-7 Bullets, was die Stufe ermöglicht |
| 11 | **Einschränkungen** | `## Einschränkungen / Grenzen` | 5-7 Bullets, was die Stufe NICHT löst |
| 12 | **Voraussetzungen / Risiken** | `## Voraussetzungen / Risiken` | 3 Sub-Blöcke: Technisch / Organisatorisch / Risiken |
| 13 | **Selbstreflexion** | `## Selbstreflexion` | 4 offene Fragen zum Nachdenken (Block-Quote „Beantworten Sie für sich") |
| 14 | **Übungsfragen** | `## Übungsfragen` | 3 Multiple-Choice-Fragen + Lösungen in Marp-Speaker-Note |
| 15 | **Mitmach-Aufgaben** | `## Mitmach-Aufgaben (Vertiefung)` | Tabelle A-D/E mit Aufwand + ⭐-Schwierigkeit |
| 16 | **Materialien** | `## Materialien & Ressourcen` | Tabelle mit Live-Demo + Selbstlern + alle 6 Doku-Files + Quellcode-Pfad |
| 17 | **Brücke zur nächsten UE** | (lead-Slide) | Heading „Brücke zu UE<N+1>" + 2 Sätze Übergang + Frage zum Mitnehmen |

## Marp-Konventionen

**Cover und letzte Slide:**
```markdown
<!-- _class: lead -->
```
Sorgt für zentrierte, größere Darstellung.

**Speaker-Notizen (Marp übernimmt sie in PPT als Notizen-Seite):**
```markdown
<!-- Speaker-Notiz: <Text für den Dozenten> -->
```

**Pill-Badge für Reifegradstufe:**
```html
<span class="pill">REIFEGRADSTUFE N</span>
```

## Inhaltliche Konsistenz-Regeln

1. **„Problemstellung → Herangehensweise → Lösung"** ist die rote
   Linie jeder Slide-Folge. Diese drei Slides erklären die UE auch
   ohne die anderen 14.

2. **Reifegradmodell-Tabelle (Slide 5)** ist in jeder UE
   identisch — nur die aktuelle Zeile wird fett markiert. So sieht
   die Studi am Verlauf der ganzen Fallstudie immer dieselbe
   Landkarte.

3. **Materialien-Slide (Slide 16)** verweist auf 6 Doku-Dateien plus
   Live-Demo. Reihenfolge: Live-Demo → Selbstlern-HTML → README →
   01-Konzept → 02-Vorteile → 03-Walkthrough → 04-Aufgaben →
   Quellcode-Pfad. Damit findet die Studi alles, was zur UE gehört.

4. **Brücke zur nächsten UE (Slide 17)** muss explizit auf den
   Übergang verweisen — *was wird in der nächsten Stufe gelöst,
   was UE_N nicht löst*. UE4 hat statt Brücke eine Rückblick-Slide.

5. **Robert-Regel** zu Halluzinations-Schutz (verbatim):
   „Es darf NIE etwas erfunden oder hinzugefügt werden, was weder in
   der Rechtsgrundlage noch in den PDFs enthalten ist."
   Dieser Satz darf in UE3 und UE4 wörtlich auftauchen, sonst nicht.

## Verwendung mit KI-PowerPoint-Generatoren

Eine KI (Marp-CLI, Pandoc-LaTeX-Beamer, Quarto, oder ein LLM mit
PowerPoint-MCP) kann aus dieser einheitlichen Struktur ableiten:

- **Folien-Layout**: Cover + Lead → Section-Title-Layout; alle
  anderen → Content-Slide-Layout
- **Tabellen** → native PPT-Tabellen
- **Code-Blöcke** → Mono-Font-Code-Block (z.B. „Courier New", grauer Hintergrund)
- **Block-Quotes** → Akzent-Box mit roter Border-Left (Wü-Rot #AD0E36)
- **Speaker-Notes** (`<!-- Speaker-Notiz: … -->`) → in PPT-Notizen-Bereich
- **Pill-HTML** (`<span class="pill">…</span>`) → farbig hinterlegtes Label

**Beispiel mit Marp-CLI:**
```bash
npx @marp-team/marp-cli@latest ue3/sachbearbeitung-ki/slides.md \
  --pptx -o slides-ue3.pptx
```

## Checkliste „neue UE-slides.md anlegen"

- [ ] Marp-Header übernommen (nur `header`-Zeile anpassen)
- [ ] 17 Slides in genau dieser Reihenfolge
- [ ] Reifegrad-Tabelle: aktuelle Zeile **fett**
- [ ] Materialien-Slide listet alle 6 Doku-Files + Live-Demo + Code
- [ ] Mindestens 1 Speaker-Note pro UE
- [ ] Übungsfragen-Lösungen ausschließlich in Speaker-Notes
  (nicht offen auf der Folie)
- [ ] Brücke zur nächsten UE als lead-Slide (UE4: Rückblick statt Brücke)
- [ ] Datum im Cover-Subtitle aktuell („· 2026")
