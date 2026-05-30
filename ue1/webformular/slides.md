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
  .pill { display: inline-block; padding: 4px 12px; border-radius: 999px;
          background: #AD0E36; color: white; font-size: 14px;
          letter-spacing: 0.06em; font-weight: 600; }
  blockquote { border-left: 4px solid #AD0E36; background: #FBE9EE;
               padding: 12px 20px; }
---

<!-- _class: lead -->

<span class="pill">REIFEGRADSTUFE 1</span>

# Strukturiertes mehrsprachiges Webformular

**Bürger:innen geben Daten direkt strukturiert ein — mit
Live-Validierung, Stepper und Multi-Förderbereich-Wizard.
DE / TR / IT / RU / FR.**

<small>Fallstudie AHP Würzburg · Modul Innovationsmanagement BBA · Dr. Robert Butscher · 2026</small>

<!-- Speaker-Notiz: Die erste „echte" digitale Stufe — der Antrag
entsteht nicht mehr aus einem PDF, sondern aus der Eingabe selbst. -->

---

## Lernziele

Nach dieser UE können Sie:

1. **Wissen** — warum ein Webformular dem PDF-Upload überlegen ist
   (und wo es nicht reicht).
2. **Verstehen** — wie Multi-FB-Wizards mit konditionalen Feldern
   funktionieren (Plugin-System).
3. **Anwenden** — eine neue Sprache (oder ein neues Feld) im
   Webformular ergänzen.
4. **Beurteilen** — wann ein Webformular barrierearm ist und wann es
   neue Hürden schafft.

---

## Ausgangslage — auch mit UE0 bleibt das PDF im Weg

- UE0 macht den Eingang strukturiert — aber das PDF muss existieren.
- Bürger:innen, die kein Deutsch sprechen, scheitern am PDF.
- Fehler in der IBAN fallen erst nach OCR + Korrekturdialog auf.
- Die Antragslogik (welche Felder pro FB?) steckt in einem starren
  Dokument.

> **Wenn wir nur PDFs digitalisieren, automatisieren wir das alte
> Verfahren — wir digitalisieren es nicht.**

---

## Problemstellung

| Schmerzpunkt | Wirkung |
|---|---|
| Sprache: PDF nur auf Deutsch | Migrant:innen ausgeschlossen |
| Pflichtfelder pro FB unterschiedlich | Bürger:in füllt Falsches aus |
| Tippfehler in IBAN erst Wochen später sichtbar | Auszahlung blockiert |
| Kein Fortschritt sichtbar | Abbruchquote hoch |
| Anlagen müssen separat geschickt werden | Vergessen, Doppel-Akten |
| Mobile UX am PDF: katastrophal | jüngere Bürger:innen springen ab |

> **Kernproblem:** Das amtliche PDF kennt nur einen Pfad. Bürger:innen
> sind divers.

---

## Reifegradmodell — wo wir stehen

| Stufe | Was neu ist | Bürger | Amt |
|---|---|---|---|
| UE0 | PDF-Upload + KI-OCR | = | ↓↓ |
| **UE1** (jetzt) | **Strukturiertes Webformular** | **↑** | **↓↓↓** |
| UE2 | Sachbearbeiter-Inbox (manuell) | = | ↓ |
| UE3 | KI-Empfehlung (Mensch entscheidet) | = | ↓↓↓ |
| UE4 | Konversationeller Agent | ↓↓ | ↓↓↓ |

> UE1 ist die **erste echte digitale Stufe** — der Antrag entsteht
> strukturiert, nicht als Dokument.

---

## Herangehensweise

**Idee:** Statt PDF nachbauen, das Antragsverhalten neu denken.

1. **Wizard mit Schritten** statt 12-seitiges Endlos-Formular
2. **Förderbereich zuerst** — danach nur passende Felder
3. **Live-Validierung** bei jedem Tastenanschlag (IBAN, E-Mail, PLZ)
4. **Sprach-Picker** ganz oben — DE / TR / IT / RU / FR
5. **Sticky-Progress** — Bürger:in sieht, wie weit sie ist
6. **Konditionale Anlagen** — z.B. Mietvertrag nur bei gemieteten Räumen

> **Plugin-System** unter `packages/foerderbereiche/` hält Pflichtfelder
> pro FB als Daten — nicht im UI verdrahtet.

---

## Tech-Stack & Tools

| Komponente | Wahl | Begründung |
|---|---|---|
| Frontend | Vite 6 + React 19 + TS 5 + Tailwind 4 | schnelle DX, kleines Bundle, typsichere FB-Plugins |
| i18n | `i18next` + `react-i18next` | lazy loading per Sprache, Fallback DE |
| Plugin-System | pnpm-Workspace-Package `packages/foerderbereiche` | EINE Wahrheit für UE1/UE3/UE4 |
| Submit-Endpoint | Supabase Edge Function `submit-antrag` (Deno) | server-seitige Re-Validation, ohne eigenen Backend-Server |
| Anlagen-Upload | Supabase Storage Bucket `antrag-anlagen` | RLS + signed URLs |
| Validierung | `iban-validator` (Mod-97), `zod` Schemas | clientside + serverside Defense-in-Depth |
| DB | Postgres 15 mit RLS, JSONB für FB-spezifische Felder | Schema-flexibel, dennoch indizierbar |
| Build/Deploy | pnpm + GitHub Actions → Docker → Traefik | reproduzierbar, atomic deploy |

---

## Architektur

```
[Bürger:in / Browser]
   │  optional: ?prefill=<einreichung_id>  (aus UE0)
   ▼
┌───────────────────────────────────────────┐
│  Webformular (Vite/React/TS, SPA)         │
│   ├─ i18n-Provider (5 Sprachen)           │
│   ├─ Stepper (Phase 1: Stamm              │
│   │              Phase 2: FB-spezifisch   │
│   │              Phase 3: Anlagen)        │
│   ├─ FB-Plugin (Pflichtfelder, Anlagen)   │
│   ├─ Live-Validation Hook                 │
│   └─ Sticky-Progress (% completed)        │
└───────────────────────────────────────────┘
   │  POST /functions/v1/submit-antrag
   ▼
┌───────────────────────────────────────────┐
│  Edge Function "submit-antrag"            │
│   - validiert Pflichtfelder erneut         │
│   - IBAN-Mod-97-Check                      │
│   - INSERT apl.antraege                    │
│   - INSERT apl.antrag_anlagen (n)          │
└───────────────────────────────────────────┘
   │
   ▼
[apl.antraege]  → Realtime → UE2 + UE3-Inbox
```

---

## Sequenz-Diagramm

```
Browser            Plugin       Storage     EdgeFn          Postgres
   │                  │            │           │                 │
 1 │ Sprach-Picker    │            │           │                 │
 2 │── load FB plugins ▶│           │           │                 │
 3 │◀── pflichtfelder[FB,Variante] │           │                 │
 4 │ Stepper Phase 1: Stammdaten   │           │                 │
 5 │ (Live-Validation: IBAN-Mod-97 lokal)      │                 │
 6 │ Stepper Phase 2: FB-spezifisch │           │                 │
 7 │ Stepper Phase 3: Anlagen      │           │                 │
 8 │── PUT anlage_1.pdf ─────────▶│            │                 │
 9 │◀── 201 storage_path ─────────│            │                 │
10 │── POST submit-antrag (JSON) ─────────────▶│                 │
11 │                  │            │           │── validate ─────│
12 │                  │            │           │── INSERT antraege▶│
13 │                  │            │           │── INSERT anlagen ▶│
14 │◀── 201 { antrag_id } ────────────────────│                 │
15 │ Bestätigungs-Seite mit Antragsnummer      │                 │
```

<!-- Speaker-Notiz: Step 11 ist die kritische Defense-in-Depth.
Selbst wenn jemand mit curl direkt postet, prüft die Edge Function
nochmal alle Plugin-Regeln. -->

---

## Datenmodell

```sql
-- apl.antraege (zentrale Antrags-Tabelle, geteilt mit UE2/UE3/UE4)
CREATE TABLE apl.antraege (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  antragsnummer   TEXT NOT NULL UNIQUE,        -- z.B. APL-2026-FBIII-…
  fb              TEXT NOT NULL                 -- I | II | III | IV
                    CHECK (fb IN ('I','II','III','IV')),
  variante        TEXT,                         -- nur FB-III: A|B|C|D
  status          TEXT NOT NULL DEFAULT 'eingegangen',
  sprache         TEXT NOT NULL DEFAULT 'de',
  antragsteller   JSONB NOT NULL,               -- Name, Tel, Email, …
  bemessung       JSONB,                        -- FB-III: Räume, Kosten
  helferliste     JSONB,                        -- FB-II
  iban            TEXT NOT NULL,
  bic             TEXT NOT NULL,
  eingereicht_am  TIMESTAMPTZ NOT NULL DEFAULT now(),
  einreichung_id  UUID REFERENCES apl.antrag_einreichung(id)
);
CREATE INDEX ON apl.antraege (status, eingereicht_am DESC);
CREATE INDEX ON apl.antraege (fb, variante);

-- apl.antrag_anlagen (n:1 zu antraege)
CREATE TABLE apl.antrag_anlagen (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  antrag_id     UUID NOT NULL REFERENCES apl.antraege(id) ON DELETE CASCADE,
  typ           TEXT NOT NULL                   -- wochenplan | mietvertrag | …
                  CHECK (typ IN ('wochenplan','mietvertrag','sonstiges')),
  storage_path  TEXT NOT NULL,
  dateigroesse  INT,
  hochgeladen_am TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Kern-Mechanismus — Plugin-System für Förderbereiche

```ts
// packages/foerderbereiche/src/fb3.ts
import type { FBConfig, Pflichtfeld } from './types';

export const fb3: FBConfig = {
  id: 'III',
  label: { de: 'Offene Altenarbeit', tr: 'Açık Yaşlı Hizmeti', … },
  varianten: ['A', 'B', 'C', 'D'],

  pflichtfelder(variante): Pflichtfeld[] {
    const base: Pflichtfeld[] = [
      { key: 'einrichtung_name',  validate: nonEmpty },
      { key: 'iban',              validate: ibanMod97 },
      { key: 'bic',               validate: bicFormat },
      { key: 'raeume_vorhanden',  type: 'boolean' },
    ];
    if (variante === 'C') {
      base.push({ key: 'c_quartier_person_name', validate: nonEmpty });
    }
    return base;
  },

  anlagen(state): Anlage[] {
    const list: Anlage[] = [{ typ: 'wochenplan', required: true }];
    if (state.raeume_vorhanden && state.raeume_gemietet) {
      list.push({ typ: 'mietvertrag', required: true });
    }
    return list;
  },
};
```

**Warum so:**
- Pflichtfelder als **Daten**, nicht als JSX — beliebig serialisierbar
- Konditionale Anlagen über Zustands-Funktion → UI bleibt deklarativ
- UE1, UE3 und UE4 importieren dasselbe Modul → keine Drift

---

## Sicherheits- & Schutzschicht

| Schicht | Mechanismus | Schutz vor |
|---|---|---|
| Frontend | `zod`-Schema pro FB-Plugin | Tippfehler, falsche Typen |
| Frontend | IBAN-Mod-97 vor Submit | falsche Auszahlungen |
| Edge Function | Re-Validation aller Plugin-Regeln | curl-Manipulation, DevTools |
| Edge Function | Rate-Limit 10 Submits/min/IP | Spam |
| DB | `CHECK` Constraints auf `fb`, `status` | ungültige Werte |
| Storage | Bucket `public=false`, signed URLs (TTL 10 min) | Direkt-Download |
| RLS | INSERT für `anon` erlaubt, SELECT nur eigene `id` (JWT-Claim) | DSGVO §5 |
| Übersetzung | Original-Sprache als `apl.antraege.sprache` mitgespeichert | Beweissicherung |

> **Defense-in-Depth:** Validierung auf 3 Schichten — Browser, Edge,
> DB-Constraint. Keine kann allein umgangen werden.

---

## Performance & Skalierung

| Metrik | Wert | Anmerkung |
|---|---|---|
| Initial Bundle | ~ 82 kB gzipped | Vite Code-Splitting |
| FB-Plugin lazy | je ~ 4–8 kB | nur das ausgewählte FB lädt |
| i18n lazy | je Sprache ~ 12 kB JSON | on-demand |
| Submit-Latenz | ~ 250 ms p50, ~ 500 ms p95 | Edge Function nah an DB |
| Anlage-Upload | ~ 1,5 MB/s | direkt zu Storage, nicht durch Backend |
| Throughput Submit | ~ 200 RPS | Rate-Limit 10/IP greift davor |
| Mobile Lighthouse | 96 / 100 | TBT < 50 ms, CLS < 0.05 |

**Bottlenecks & Mitigationen:**
- Große Anlagen → direkter Storage-Upload (Bypass Edge Function)
- i18n bei vielen Sprachen → on-demand statt all-in-one
- IBAN-Validierung → clientside zuerst (entlastet Edge Function)

---

## Live-Demo

🌐 **<https://antrag.butscher.cloud/>**

1. Sprach-Picker: TR auswählen → komplettes UI türkisch
2. FB-III auswählen, Variante C („Quartier")
3. IBAN-Feld: bewusst falsch tippen → Live-Validierung rot
4. Pflichtfelder durchgehen, Wochenplan-PDF hochladen
5. Submit → Antragsnummer

<small>Bonus: Prefill-Demo mit URL <code>?prefill=&lt;einreichung_id&gt;</code>
aus UE0</small>

<!-- Speaker-Notiz: Vorher eine UE0-Einreichung anstoßen, damit
Prefill-Demo nahtlos läuft. Türkisch zeigen ist der „Aha"-Moment. -->

---

## Chancen

- **Barriere-Senkung** für Migrant:innen (5 Sprachen, weitere skalierbar)
- **Sofort-Fehler-Erkennung** durch Live-Validierung
- **Höhere Abschlussquote** durch Stepper + Sticky-Progress
- **Konsistente Daten** im Amt (keine OCR-Drift mehr)
- **Mobile-tauglich** — Anträge auch vom Smartphone
- **Wiederverwendbarkeit** — Plugin-System für jeden weiteren Antragstyp

---

## Einschränkungen / Grenzen

- **Verwaltungs-Sprache bleibt:** Fachbegriffe („Pauschale Förderung
  Ehrenamt") überfordern auch übersetzt
- **Senior:innen ohne Internet** brauchen weiterhin Papier-Pfad
- **Lange Formulare** sind und bleiben anstrengend, auch mit Wizard
- **Bürger:in muss selbst entscheiden**, welcher FB passt (UE4 löst das)
- **Plugin-Pflege** ist Code-Arbeit — kein Sachbearbeiter:innen-UI
- **Kein KI-Vorschlag** — der Antrag wird so eingereicht, wie eingegeben

---

## Voraussetzungen / Risiken

**Technisch:**
- Frontend-Toolchain (Vite/React/TS, i18next, zod)
- Plugin-System mit guten Typen
- Storage für Anlagen (mit RLS + signed URLs)

**Organisatorisch:**
- Übersetzungen rechtssicher prüfen (Amt haftet für Inhalte!)
- Datenschutz: alle Eingaben vor Submit nur im Browser
- Klar definiert: was passiert mit Halb-fertigen Anträgen?

**Risiken:**
- Falsche Übersetzung führt zu falschen Anträgen
- Mitigation: Originalsprache als „Quelle der Wahrheit" beim Submit
  mitspeichern (`apl.antraege.sprache`)

---

## Selbstreflexion

> Beantworten Sie für sich diese 4 Fragen:

1. **Welche Bürger:innen-Gruppen schließt UE1 trotzdem noch aus —
   und wie würden Sie das adressieren?**
2. **Wer trägt die Verantwortung, wenn eine Übersetzung im
   Webformular juristisch von der amtlichen Vorlage abweicht?**
3. **Wann ist ein Wizard die richtige UI — und wann ein 1-Seiten-Formular?**
4. **Wenn UE0 und UE1 gleichzeitig angeboten werden: wer wählt was,
   und sollte das Amt steuern?**

---

## Übungsfragen

**Frage 1:** Was passiert bei IBAN-Tippfehler in UE1?
<small>(a) Submit blockiert, Live-Feedback · (b) Submit geht durch,
Amt prüft · (c) wird automatisch korrigiert · (d) UE3-KI prüft später</small>

**Frage 2:** Wo stehen die Pflichtfelder pro FB?
<small>(a) im UI hart codiert · (b) in der Richtlinie als PDF ·
(c) im Plugin-System unter <code>packages/foerderbereiche</code> ·
(d) in der DB</small>

**Frage 3:** Welche Stufe wird durch UE1 ÜBERSPRINGBAR?
<small>(a) keine, UE1 ergänzt nur · (b) UE0, wenn Bürger:in direkt
strukturiert eingibt · (c) UE2 · (d) UE3</small>

<!-- Speaker-Notiz: Lösungen: 1=a, 2=c, 3=b. -->

---

## Mitmach-Aufgaben (Vertiefung)

| Code | Titel | Aufwand | ⭐ |
|---|---|---|---|
| A | Eigenes Validierungs-Feld einbauen (Telefon-Format) | 45 Min | ⭐⭐ |
| B | 5. Sprache (z.B. Polnisch) für UE1 + UE0-Sprach-Dropdown | 90 Min | ⭐⭐ |
| C | FB-II um neues Pflichtfeld erweitern (Plugin + UI + DB) | 90 Min | ⭐⭐⭐ |
| D | Antrags-Daten direkt in Supabase Studio inspizieren | 30 Min | ⭐ |

Detail: **`ue1/webformular/04-aufgaben.md`**

---

## Materialien & Ressourcen

| Ressource | Pfad / URL |
|---|---|
| 🌐 **Live-Demo** | <https://antrag.butscher.cloud/> |
| 📚 **Selbstlern-Modul (HTML)** | [`selbstlern.html`](./selbstlern.html) |
| 📝 **Konzept-Markdown** | [`01-konzept.md`](./01-konzept.md) |
| ⚖️ **Vorteile / Voraussetzungen** | [`02-vorteile-voraussetzungen.md`](./02-vorteile-voraussetzungen.md) |
| 🛠 **Dozent-Walkthrough** | [`03-walkthrough.md`](./03-walkthrough.md) |
| ✏️ **Studi-Aufgaben** | [`04-aufgaben.md`](./04-aufgaben.md) |
| 💻 **Quellcode** | `ue1/webformular/` + `packages/foerderbereiche/` + `supabase/functions/submit-antrag/` |

---

<!-- _class: lead -->

# Brücke zu UE2

Saubere Daten kommen jetzt im Amt an — aber die Sachbearbeitenden
verwalten sie immer noch in **Excel-Listen und Mail-Postfächern**.
**UE2** baut die richtige Verwaltungs-IT dahinter: geteilte Inbox,
Workflow-Engine, Audit-Trail.

> **Frage zum Mitnehmen:** Wie viel Effizienz gewinnt UE1 für die
> Sachbearbeitenden — wenn dahinter noch immer ein Mail-Prozess steckt?
