# UE1 — Intelligentes Webformular (APL 2)

> **Reifegradstufe 1**: Das gleiche PDF-Formular der Stadt Würzburg, aber als Webformular mit Validierung, Anlagen-Prüfung, Druckansicht und **mehrsprachig** (DE/IT/TR/ES). Optisch an der Corporate-Identity der Stadt Würzburg orientiert. Der abgesendete Antrag wird über eine Supabase-Edge-Function (`submit-antrag`) ins gemeinsame Backend geschrieben, das UE2 und UE3 lesen — **gleiche Datenquelle für alle drei Reifegradstufen**.

## Schnellstart

### Variante A: Lokal
```bash
git clone https://github.com/swrobuts/DigitalisierungVerwaltung.git
cd DigitalisierungVerwaltung/ue1/webformular
npm install
npm run dev
```
Browser: http://localhost:5173/DigitalisierungVerwaltung/ue1/webformular/

### Variante B: StackBlitz (ohne Installation)
👉 https://stackblitz.com/github/swrobuts/DigitalisierungVerwaltung/tree/main/ue1/webformular

### Tests
```bash
npm test
```

## Doku
- [01-konzept.md](./01-konzept.md) — Warum diese Stufe? Konzept-Skizze
- [02-vorteile-voraussetzungen.md](./02-vorteile-voraussetzungen.md) — Nutzen, Grenzen, Voraussetzungen
- [03-walkthrough.md](./03-walkthrough.md) — Code-Walkthrough + Mitmach-Aufgabe

## Demo (öffentlich)
https://swrobuts.github.io/DigitalisierungVerwaltung/ue1/webformular/

## Original-Materialien (alle 5 UEs teilen sich den gleichen Fall)
- [Antrag APL 2 (PDF)](../../materialien/antrag-apl2.pdf)
- [Anlage APL 2 (PDF)](../../materialien/anlage-antrag-apl2.pdf)
- [Förderrichtlinie AHP (PDF)](../../materialien/foerderrichtlinie-ahp-2025-03-27.pdf)

## Hinweis Übersetzungen
Die Labels in IT/TR/ES sind **Demo-Übersetzungen**. In einem realen Einsatz müssten sie durch Fachübersetzer geprüft werden — gerade die juristischen Termini der Förderrichtlinie AHP.

## Hinweis CI Stadt Würzburg
Das Webformular orientiert sich optisch an der Corporate Identity der Stadt Würzburg (Farben, Schrift). Es ist ein **Lehr-Demo** — kein offizielles Angebot der Stadt Würzburg und nicht von ihr autorisiert.
