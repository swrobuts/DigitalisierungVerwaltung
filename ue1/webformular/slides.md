---
marp: true
theme: default
paginate: true
header: "UE1 · Mehrsprachiges Webformular · Reifegradstufe 1"
footer: "Fallstudie AHP Würzburg · Dr. Robert Butscher · THWS"
style: |
  section { font-family: 'Inter', system-ui, sans-serif; }
  h1, h2, h3 { color: #4A4A4A; }
  .accent { color: #AD0E36; font-weight: 600; }
  .pill {
    display: inline-block; padding: 4px 12px; border-radius: 999px;
    background: #AD0E36; color: white; font-size: 14px;
    letter-spacing: 0.06em; font-weight: 600;
  }
  blockquote {
    border-left: 4px solid #AD0E36;
    background: #FBE9EE; padding: 12px 20px;
  }
---

<!-- _class: lead -->

<span class="pill">REIFEGRADSTUFE 1</span>

# Strukturiertes mehrsprachiges Webformular

Live-Validierung, Sticky-Progress, Multi-Förderbereich-Wizard, DE/TR/IT/RU/FR

<small>Fallstudie AHP Würzburg · Modul Innovationsmanagement BBA · Dr. Robert Butscher</small>

---

## Heute: PDF + Mail

Selbst wenn das Amt ein PDF-Formular bereitstellt:

- Pflichtfelder werden übersehen
- IBAN mit Zahlendreher → Bank lehnt Auszahlung ab
- Anlagen werden vergessen → Rückfrage per Brief → Wochen Verzögerung
- Handschrift unleserlich → Erfassungsfehler im Amt
- **Sprachbarriere**: das deutsche PDF ist für nicht-deutschsprachige
  Antragsteller schwer zugänglich

> Würzburg hat einen hohen Anteil türkischer, italienischer,
> spanischer Mitbürger:innen — das PDF ist deutsch.

---

## Reifegradstufen — wo wir sind

| Stufe | Was neu ist | Bürger | Amt |
|---|---|---|---|
| UE0 | PDF-Upload + KI-OCR | = | ↓↓ |
| **UE1** (heute) | **Strukturiertes Webformular** | ↑ | ↓↓↓ |
| UE2 | Sachbearbeiter-UI (manuell) | = | ↓ |
| UE3 | KI-Vorschlag (Mensch entscheidet) | = | ↓↓↓ |
| UE4 | Konversationeller Agent | ↓↓ | ↓↓↓ |

UE1 ist die **erste Stufe mit aktiver Bürger-Eingabe** statt PDF-Erfassung.

---

## UE1 in einem Bild

```
[Bürger:in]
   |
   | 1. Förderbereich wählen (I/II/III/IV)
   |    bei FB III: Variante A/B/C/D
   v
[Sticky-Progress-Bar zeigt 4 Schritte]
   |
   | 2. Phase 2 — FB-spezifische Felder
   |    (Live-Validation: IBAN, E-Mail, PLZ)
   v
   | 3. Phase 3 — Anlagen (Wochenplan, Helferliste, Mietvertrag)
   v
   | 4. Phase 4 — Bemessungs-Daten (nur FB III)
   v
   | 5. Phase 5 — Übersicht + Submit
   v
[Edge Function `submit-antrag`]
   ├ validiert server-side
   ├ INSERT apl.antraege (mit IP, User-Agent)
   ├ Storage-Upload aller Belege
   └ Antragsnummer aus DB-Trigger
   |
   v
[Bürger:in sieht Bestätigung + Antragsnummer]
[UE2/UE3 sehen den Antrag in der Inbox]
```

---

## Live-Demo

🌐 **<https://antrag.butscher.cloud/>**

1. „Direkt loslegen" klicken (statt UE0-Pfad)
2. FB III · Variante C (Seniorenkreis) auswählen
3. Beobachten: nur relevante Felder werden angezeigt
4. Live-Validierung: IBAN-Eingabe mit Tippfehler testen
5. Sprache wechseln (DE → TR)
6. Submit + Antragsnummer kommt

<small>Alternative: aus UE0 kommend, mit Prefill testen</small>

---

## Was UE1 gewinnt

| Aspekt | PDF heute | UE1 |
|---|---|---|
| Erfassungsfehler | hoch | niedrig (live) |
| Pflichtfeld-Vergessen | häufig | sofort markiert |
| IBAN-Fehler | erst bei Bank sichtbar | Mod-97-Check sofort |
| Anlagen vergessen | typisch | Webform meckert vor Submit |
| Sprachbarriere | nur deutsch | DE/TR + IT/RU/FR (β) |
| Barrierearmut | schwer (PDF) | umsetzbar (ARIA) |

---

## Was UE1 nicht löst

- Keine Eingangsbestätigung per Mail (kommt in UE2)
- Kein Status-Tracking („Wo ist mein Antrag?") (UE2)
- Keine Sachbearbeiter-Sicht (UE2)
- **Kein medienbruchfreier Eingang** — irgendjemand muss noch lesen
- Keine semantische Prüfung gegen die Richtlinie (UE3)
- Keine automatisierte Bescheid-Erstellung (UE3)
- Übersetzungen sind Demo-Qualität — in Produktion Fachübersetzer
- Bürger:in muss Felder selbst tippen (kein OCR-Prefill ohne UE0)

---

## Multi-FB-Architektur

Vier Förderbereiche, einer davon mit 4 Varianten:

| FB | Was | Pflichtfelder |
|---|---|---|
| I | Aufbau niedrigschwelliger Angebote | projekt_titel, laufzeit, ... |
| II | Pauschale Ehrenamt | helferliste (Excel-Import!) |
| III A | Mehrgenerationenhaus | bundesprogramm_bestaetigung |
| III B | Begegnungszentrum | b_anzahl_veranstaltungen, b_teilnehmer_* |
| III C | Seniorenkreis | c_treffen_schwelle (GT_10/20/40), c_teilnehmer_durchschnitt |
| III D | Quartiersmanagement | d_hauptamt_name, d_hauptamt_stunden_* |
| IV | Schwerpunkt | formlos (PDF-Upload reicht) |

**Datengetrieben:** `packages/foerderbereiche/` als TS-Module, kein
Hardcoding pro UE.

---

## i18n-Stack

- **DE + TR vollständig** (Helferkreise sind oft türkisch geprägt)
- **IT + RU + FR im Picker** mit β-Marker, Fallback auf DE
- **Banner unter Header**: „Übersetzung in Vorbereitung — Anzeige auf Deutsch"
- `data-i18n`-Attribute im HTML, JSON-Tabelle in `src/lib/i18n.ts`
- Sprache persistiert in `localStorage`
- **Sprach-Wechsel** triggert kompletten Re-Mount via `key`-Trick

> Vorteil: nicht „all or nothing" — eine β-Sprache hilft schon, wenn
> der Picker zeigt, dass das Amt sie *anstrebt*.

---

## Code-Walkthrough (4 Stellen, je 2-3 Min)

1. **`src/types.ts`** — Domain-Model: 1:1-Spiegelung der PDF-Felder
   pro FB + Variante. Grundlage für alle weiteren Stufen.
2. **`src/lib/validation.ts`** — pure Funktionen (IBAN-Mod-97,
   E-Mail-RFC, PLZ-Format, Euro-Parsing). Vitest-getestet.
3. **`src/lib/i18n.ts` + Sprach-Picker** — Drei Funktionen
   (`setSprache`, `t`, `tx`), JSON-Tabelle, Re-Mount via Event.
4. **Edge Function `submit-antrag`** — validiert server-side, INSERT
   atomar mit Storage-Upload, **full rollback** bei Upload-Fehler.

---

## Sticky-Progress-Bar — warum?

Klassisches UX-Pattern für Multi-Step-Forms:

- Immer sichtbar, was schon erledigt ist, was noch kommt
- Klick zurück zu früherem Step erlaubt (nicht vorwärts)
- Bei Validierungs-Fehler wird der betroffene Step rot markiert
- Sprach-Wechsel mittendrin: kein Datenverlust

Alternative wäre ein einziges langes Formular. Pro/Contra-Diskussion!

---

## ⚖️ DSGVO &amp; Schrems II

- **Personenbezogene Daten** werden gespeichert (Name, Anschrift,
  E-Mail, IP, User-Agent) → volle DSGVO ab UE1
- **AVV mit Hosting-Provider** zwingend
- **Löschkonzept** (z.B. 5 Jahre nach Bescheid)
- **Datenschutzhinweis** im Formular
- **Verarbeitungsverzeichnis** anlegen
- **Google Fonts**: Demo nutzt fonts.googleapis.com → Schrems II
  → für Produktion self-hosted!

> Anon-Key im Frontend-Bundle sichtbar — Sicherheit kommt aus
> RLS + Edge-Function-Validation, nicht aus Key-Geheimhaltung.

---

## Mitmach-Aufgaben

- **A** — Neue Validierungs-Regel: Personalkosten > Betriebskosten
  als Hinweis (15 Min)
- **B** — Fünfte Sprache (z.B. Polnisch) komplett übersetzen (60 Min)
- **C** — Neues FB-II-Pflichtfeld durch alle Schichten ziehen (90 Min)
- **D** — Antrag in der DB anschauen (Supabase Studio, 20 Min)

Detail-Anleitung: **`ue1/webformular/04-aufgaben.md`**

---

<!-- _class: lead -->

# Fragen?

**Nächste Stunde:** UE2 — die manuelle Sachbearbeiter-Sicht, die den
Antrag in der Inbox empfängt

<small>Materialien: <code>ue1/webformular/{README, 01-konzept, 02-vorteile-voraussetzungen, 03-walkthrough, 04-aufgaben, slides, selbstlern}</code></small>
