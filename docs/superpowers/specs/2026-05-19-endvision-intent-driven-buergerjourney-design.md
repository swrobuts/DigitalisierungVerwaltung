# End-Vision — Intent-getriebene Bürger-Journey für AHP

**Stand:** 2026-05-19 (vormittags)
**Autor:** swrobuts (mit Claude Opus 4.7)
**Vorgänger-Specs:** `2026-05-17-roadmap-5-ue-digitalisierung-verwaltung.md`, UE1- und UE2-Detail-Specs
**Status:** Roadmap-Revision · ersetzt die ursprüngliche UE3/UE4/UE5-Skizze in der Roadmap-Spec

## 1. Vision

Ein einziger Bürger-Touchpoint: Der Bürger ruft eine Seite auf, schreibt in seiner Muttersprache, was er braucht („Ich brauche Geld für die Tagesstätte meiner Mutter"). Die Anwendung erkennt Sprache + AHP-Plan, lädt das passende Schema, der Bürger lädt Belege hoch, Claude extrahiert Felder, das Formular zeigt nur noch das, was offen ist (transparent + editierbar). Submit speichert wie bisher, der Sachbearbeiter sieht den Antrag in seiner Inbox (UE2-Backend bleibt unverändert).

Diese End-Vision ersetzt die ursprüngliche 5-Stufen-Reifegradleiter nicht — sie schärft die didaktische Pointe: jede UE ist ein konkreter Baustein, der erst zusammen das Bild ergibt. Die Studis bauen das System, indem sie es 5-mal aus verschiedenen Perspektiven angehen.

## 2. Reifegradleiter (Revision der Roadmap-Spec §3)

| UE | Stand | Funktion in der End-Vision |
|----|-------|----------------------------|
| **1** | live | APL2-Antragsformular. v2: belege-zentriert (Repeater + Summation + Pflichtfeld-Hygiene). Bleibt hardcoded für APL2 (1 von 11), dient als Referenz-Implementation. |
| **2** | live | Sachbearbeiter-Workflow. Bekommt nur kleine Erweiterung wenn UE3 neue Felder einführt. |
| **3** | offen | **Ontologie + Schema-Repository.** Doppelschichtig: (a) JSON-Schemas pro AHP-Plan (Struktur), (b) formale Ontologie + Plausibilitätsregeln (Bedeutung + Cross-Field-Logik). Aus AHP-PDF extrahiert. |
| **4** | offen | **Intelligenz-Layer.** PageIndex-Stil-Doc-Tree über AHP-Richtlinie + Belege-Extraktion (PDF/Foto → strukturierte Felder gemäß Schema). |
| **5** | offen | **Orchestration.** Chat-Einstieg, Intent + Sprach-Detection, Form-Generator aus Schema, End-zu-End-Bürger-Journey auf eigener Subdomain. |

## 3. Architektur (Ziel-Zustand nach UE5)

```
                       ┌──────────────────────────────────────────────┐
                       │ Bürger-Journey (eine Single-Page-App)        │
                       └──────────────────────────────────────────────┘
                                          │
        ┌─────────────────────────────────┼─────────────────────────────────┐
        ▼                                 ▼                                 ▼
  ┌────────────┐                  ┌──────────────┐                  ┌────────────┐
  │ ENTRY      │  Freitext        │ DROPZONE     │ Belege          │ FORM       │
  │ (Was       │  ─────►          │ (PDF/Foto)   │ Upload          │ (Restfelder│
  │  brauchen  │                  │              │ ─────►          │  + edit)   │
  │  Sie?)     │                  │              │                  │            │
  └─────┬──────┘                  └──────┬───────┘                  └─────┬──────┘
        │                                │                                │
        ▼                                ▼                                ▼
  INTENT-AGENT (UE5)         EXTRACTION-AGENT (UE4)              ANTRAGSTELLUNG
   Claude API                 Claude API + Vision                 Edge Function
   ├── Sprache?               ├── Welche Felder?                  (wie UE1 heute,
   ├── Welcher AHP-Plan?      ├── Werte                            erweitert um
   │   (1 von 11)             ├── Konfidenz                        belegposition)
   └── lädt Schema            └── Quelle (Datei + Page)
       aus ahp_schemas (UE3)
                                          ▲
                                          │ liest passend zum
                                          │ intent-detected Plan
                                          │
                                ┌─────────┴────────┐
                                │ ahp_schemas      │  UE3 schichtet
                                │ ontologie_*      │  diese auf
                                │ ahp_plaene       │
                                └──────────────────┘
```

**Datenfluss:** Bürger sagt was er will → Intent-Agent (UE5) erkennt Sprache + AHP-Plan → lädt Schema (aus UE3) → Bürger lädt Belege → Extraction-Agent (UE4) extrahiert Felder gemäß Schema → Form rendert dynamisch, vorgefüllt mit Quelle pro Feld → Bürger korrigiert/ergänzt → Submit landet in `apl2.antraege` (wie heute).

**Continuity:** UE1+UE2 bleiben funktional unverändert. UE1-v2-Refactor läuft parallel und ist Voraussetzung für die spätere Form-Generierung in UE5 (gleiches Datenmodell `belegposition`).

## 4. Datenmodell — additive Erweiterungen

| Tabelle / Spalte | Inhalt | Befüllt von | Gelesen von |
|---|---|---|---|
| `apl2.ahp_plaene` (NEU) | 11 AHP-Pläne: `id`, `kurzname`, `bezeichnung`, `paragraph`, `aktiv` | UE3 (manuell) | UE5 (Intent-Mapping) |
| `apl2.ahp_schemas` (NEU) | JSON-Schema pro Plan: `plan_id`, `version`, `schema_jsonb` mit Felder/Pflicht-Kann/Belegtypen/i18n | UE3 (KI-assistiert) | UE1-v2 (für APL2), UE5 (Form-Generator) |
| `apl2.ontologie_classes` (NEU) | Begriffe: `id`, `iri`, `label_de`, `parent_class_id` | UE3 | UE4 (Plausi-Check) |
| `apl2.ontologie_properties` (NEU) | Beziehungen: `id`, `from_class`, `to_class`, `cardinality` | UE3 | UE4 |
| `apl2.ontologie_rules` (NEU) | Plausi-Regeln (SHACL/JSON-Logic): `id`, `plan_id`, `condition_jsonb`, `error_msg_de` | UE3 | UE4 (beim Submit) |
| `apl2.belegposition` (NEU) | Einzel-Position: `id`, `antrag_id`, `belegtyp`, `bezeichnung`, `betrag_euro`, `anlage_id` | UE1-v2 | UE2, UE4 |
| `apl2.antraege.plan_id` (Spalte, default `APL2`) | Welcher der 11 Pläne | UE1-v2/UE5 | UE2, UE3 |
| `apl2.antraege.intent_text` (Spalte, NULLable) | Bürger-Freitext | UE5 | Audit |
| `apl2.antraege.detected_language` (Spalte, fallback = `submitted_language`) | Bürger-Sprache | UE5 | UE2 |
| `apl2.anlagen.extracted_fields_jsonb` (Spalte) | `{feld_id: {wert, konfidenz, page, bbox}}` | UE4 | UE1-v2 / UE5 |

Alle Migrationen **additiv** — keine destructive change auf Bestehendem. Bestandsdaten bekommen `plan_id='APL2'` als Default.

## 5. Konsequenz für die nächsten Schritte (heute)

1. **UE1-v2-Spec** als eigenes Dokument (`2026-05-19-ue1-v2-belegezentriert-design.md`). Refactor des Formulars: Repeater-Listen pro Belegtyp, Summation, Pflichtfeld-Hygiene nach AHP-Richtlinie (konkrete Paragraphen-Verweise dort). Vorbereitung der `belegposition`-Tabelle.
2. **UE1-v2 implementieren** (eigener Plan + Subagent-Driven oder Inline).
3. UE3-Detail-Spec wenn UE1-v2 läuft.

## 6. Nicht im Scope dieser Spec

- Konkrete UE3/UE4/UE5-Implementationsdetails — kommen in separaten Detail-Specs.
- Welches LLM-Modell wofür (Claude API direkt vs. via n8n) — wird pro UE entschieden.
- DSGVO-Detailbetrachtung der Belege-Extraktion (verarbeitet wo? Anthropic EU-Endpunkt vs. lokal). Klärung mit Datenschutz-Beauftragten Stadt Würzburg vor UE4.
- Multi-Tenant (mehrere Städte) — bleibt explizit ausgeschlossen.

## 7. Offene Fragen für UE3+

- AHP-PDF-Parsing für 11 Schemas: vollautomatisch (Claude) vs. KI-assistiert (Claude schlägt vor, Mensch reviewt)? — Empfehlung: KI-assistiert, weil 11 Pläne überschaubar und Qualität wichtig.
- Versionierung der Schemas: `ahp_schemas.version` als Monotonisch-aufsteigend pro Plan, alte Anträge referenzieren ihre Schema-Version (audit-trail-relevant).
- Ontologie-Editierung: SQL-Editor oder eigene UI? — UE3 sollte minimal eine SQL-Tabelle + Validation-Script bringen, eigene UI ist Hands-on-Aufgabe.

## 8. Akzeptanzkriterien dieser Spec

- [x] Robert nickt § 1–§ 4 ab (erfolgt im Brainstorming 2026-05-19)
- [x] Spec committed
- [ ] Roadmap-Spec wird upgedatet (UE3/4/5-Beschreibungen)
- [ ] UE1-v2-Spec wird als Folge-Dokument erstellt
