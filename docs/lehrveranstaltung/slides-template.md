# Slide-Template für alle UEs (Reifegradstufen 0–4)

> **Zweck:** Einheitliches didaktisches Schema für alle UE-`slides.md`.
> Jede UE folgt der gleichen 22-Slide-Sequenz. So sieht die Studi an
> jeder Stelle dieselbe Landkarte, und eine KI kann daraus
> konsistente PowerPoints ableiten.

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

## 22-Slide-Sequenz

| # | Slide | Block | Zweck |
|---|---|---|---|
| 1 | **Cover** | Einstieg | Pill „REIFEGRADSTUFE N" + Titel + 1-Satz-Tagline |
| 2 | **Lernziele** | Einstieg | 4 Bullets: Wissen / Verstehen / Anwenden / Beurteilen |
| 3 | **Ausgangslage** | Problem | Status quo aus Vorgänger-UE / Welt vor dieser Stufe |
| 4 | **Problemstellung** | Problem | Tabelle Schmerzpunkt ↔ Wirkung + Block-Quote „Kernproblem" |
| 5 | **Reifegradmodell** | Einordnung | 5-Zeilen-Tabelle UE0–UE4, aktuelle Zeile **fett** |
| 6 | **Herangehensweise** | Lösung | Lösungsidee als nummerierte Liste 1-6 + Block-Quote |
| 7 | **Tech-Stack & Tools** | **Technik** | Tabelle: Komponente / Wahl / Begründung |
| 8 | **Architektur** | **Technik** | ASCII-Diagramm Komponenten + Datenfluss (high-level) |
| 9 | **Sequenz-Diagramm** | **Technik** | Schritt-für-Schritt-Abfolge mit Aktoren (UML-artig) |
| 10 | **Datenmodell** | **Technik** | DB-Tabellen / Spalten / Constraints / Trigger |
| 11 | **Kern-Mechanismus** | **Technik** | Code-Snippet (15-30 Z.) + 2-3 Bullets Erläuterung |
| 12 | **Sicherheits- & Schutzschicht** | **Technik** | RLS / Validatoren / Whitelist / Defense-in-Depth |
| 13 | **Performance & Skalierung** | **Technik** | Latenzen / Caching / Bottlenecks / Kosten |
| 14 | **Live-Demo** | Anwendung | URL bold + 5-7-Schritt-Anleitung + Speaker-Note |
| 15 | **Chancen** | Bewertung | 6-7 Bullets, was die Stufe ermöglicht |
| 16 | **Einschränkungen / Grenzen** | Bewertung | 5-7 Bullets, was die Stufe NICHT löst |
| 17 | **Voraussetzungen / Risiken** | Bewertung | Sub-Blöcke: Technisch / Organisatorisch / Risiken |
| 18 | **Selbstreflexion** | Reflexion | 4 offene Fragen zum Nachdenken |
| 19 | **Übungsfragen** | Wissen prüfen | 3 Multiple-Choice + Lösungen in Marp-Speaker-Notes |
| 20 | **Mitmach-Aufgaben** | Vertiefung | Tabelle A–D/E mit Aufwand + ⭐-Schwierigkeit |
| 21 | **Materialien & Ressourcen** | Verweis | Tabelle: Live-Demo + Selbstlern + alle 6 Doku-Files + Code-Pfad |
| 22 | **Brücke zur nächsten UE** | Ausblick | Übergangs-Frage zum Mitnehmen (UE4: Rückblick) |

**Blockstruktur:** Einstieg (1-2) → Problem (3-4) → Einordnung (5) →
Lösungsidee (6) → **Technik (7-13)** → Anwendung (14) →
Bewertung (15-17) → Reflexion + Vertiefung (18-20) →
Verweis + Ausblick (21-22).

## Technik-Block (Slides 7-13) — präzise Anforderungen

### Slide 7: Tech-Stack & Tools
Tabelle mit Spalten: **Komponente · gewählte Technologie · warum diese
Wahl**. Pflicht: jede Wahl wird begründet — keine Buzzword-Aufzählung.

### Slide 8: Architektur (high-level)
ASCII-Diagramm der Komponenten + Datenfluss. Top-down. Beschriftete
Pfeile zwischen den Boxen. Keine Implementierungs-Details, nur
Verantwortlichkeiten.

### Slide 9: Sequenz-Diagramm
Schritt-für-Schritt-Abfolge eines konkreten User-Flows mit den
beteiligten Aktoren (Browser, Edge Function, n8n, LLM, DB).
Nummeriert (1, 2, 3 …) und mit Inhalt pro Schritt (was wird übergeben,
was kommt zurück).

### Slide 10: Datenmodell
DB-Tabellen mit relevanten Spalten + Typen + Constraints. Zeigt
Trigger / RLS-Policies / Indexe wo relevant. Idealerweise als
SQL-Snippet oder strukturierte Tabelle.

### Slide 11: Kern-Mechanismus
Das EINE Code-Snippet, das die zentrale Innovation der UE zeigt.
15-30 Zeilen. Darunter 2-3 Bullets, die erklären, **warum** das so
gebaut ist.

### Slide 12: Sicherheits- & Schutzschicht
Defense-in-Depth-Listing: welche Schichten verteidigen gegen
welche Angriffe / Fehler. Bei KI-UEs (UE3/UE4) zentral der
Halluzinations-Schutz, bei Auth-UEs (UE2) RLS + Magic-Link,
bei Daten-UEs (UE0/UE1) Validierung + signed URLs.

### Slide 13: Performance & Skalierung
Konkrete Zahlen: Latenzen, Throughput, Kosten, Limits.
Caching-Strategien, Parallelisierung, Bottleneck-Analyse.
Keine Vermutungen — gemessene oder dokumentierte Werte.

## Marp-Konventionen

**Cover und letzte Slide:**
```markdown
<!-- _class: lead -->
```
Zentrierte, größere Darstellung.

**Speaker-Notizen (Marp übernimmt sie in PPT als Notizen-Seite):**
```markdown
<!-- Speaker-Notiz: <Text für den Dozenten> -->
```

**Pill-Badge für Reifegradstufe:**
```html
<span class="pill">REIFEGRADSTUFE N</span>
```

## Inhaltliche Konsistenz-Regeln

1. **„Problemstellung → Herangehensweise → Lösung → Bewertung"** ist
   die rote Linie jeder Slide-Folge. Die Reihenfolge ist nicht
   verhandelbar.

2. **Reifegradmodell-Tabelle (Slide 5)** ist in jeder UE
   identisch — nur die aktuelle Zeile wird fett markiert. So sieht
   die Studi am Verlauf der ganzen Fallstudie immer dieselbe
   Landkarte.

3. **Materialien-Slide (Slide 21)** verweist auf 6 Doku-Dateien plus
   Live-Demo. Reihenfolge: Live-Demo → Selbstlern-HTML → README →
   01-Konzept → 02-Vorteile → 03-Walkthrough → 04-Aufgaben →
   Quellcode-Pfad.

4. **Brücke zur nächsten UE (Slide 22)** muss explizit auf den
   Übergang verweisen — *was wird in der nächsten Stufe gelöst,
   was UE_N nicht löst*. UE4 hat statt Brücke eine Rückblick-Slide.

5. **Robert-Regel** zu Halluzinations-Schutz (verbatim):
   „Es darf NIE etwas erfunden oder hinzugefügt werden, was weder in
   der Rechtsgrundlage noch in den PDFs enthalten ist."
   Dieser Satz darf in UE3 und UE4 wörtlich auftauchen, sonst nicht.

6. **Technik-Block (7-13)** muss substantiell sein. Keine Buzzwords.
   Jede Aussage mit Code-Pfad, Tabellenname, Endpoint, oder
   messbarer Zahl unterfüttert.

## Verwendung mit KI-PowerPoint-Generatoren

Eine KI kann aus dieser Struktur ableiten:

- **Folien-Layout**: Cover + Lead-Slides → Section-Title-Layout;
  alle anderen → Content-Slide-Layout
- **Tabellen** → native PPT-Tabellen
- **Code-Blöcke** → Mono-Font-Code-Block (z.B. „Courier New",
  grauer Hintergrund)
- **Block-Quotes** → Akzent-Box mit roter Border-Left
  (Wü-Rot #AD0E36)
- **Speaker-Notes** (`<!-- Speaker-Notiz: … -->`) → in
  PPT-Notizen-Bereich
- **Pill-HTML** (`<span class="pill">…</span>`) → farbig hinterlegtes Label

**Beispiel mit Marp-CLI:**
```bash
npx @marp-team/marp-cli@latest ue3/sachbearbeitung-ki/slides.md \
  --pptx -o slides-ue3.pptx
```

## Checkliste „neue UE-slides.md anlegen"

- [ ] Marp-Header übernommen (nur `header`-Zeile anpassen)
- [ ] 22 Slides in genau dieser Reihenfolge
- [ ] Reifegrad-Tabelle: aktuelle Zeile **fett**
- [ ] Technik-Block (7-13) substantiell — keine Buzzwords
- [ ] Performance-Slide nur mit gemessenen oder dokumentierten Zahlen
- [ ] Sicherheits-Slide enthält Defense-in-Depth-Aspekt
- [ ] Datenmodell-Slide enthält Constraints + Trigger / RLS
- [ ] Materialien-Slide listet alle 6 Doku-Files + Live-Demo + Code
- [ ] Mindestens 1 Speaker-Note pro UE
- [ ] Übungsfragen-Lösungen ausschließlich in Speaker-Notes
- [ ] Brücke zur nächsten UE als lead-Slide (UE4: Rückblick statt Brücke)
- [ ] Datum im Cover-Subtitle aktuell („· 2026")
