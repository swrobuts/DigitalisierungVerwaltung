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
2. **Förderbereich zuerst** — danach nur noch passende Felder
3. **Live-Validierung** bei jedem Tastenanschlag (IBAN, E-Mail, PLZ)
4. **Sprach-Picker** ganz oben — DE / TR / IT / RU / FR
5. **Sticky-Progress** — Bürger:in sieht, wie weit sie ist
6. **Konditionale Anlagen** — z.B. Mietvertrag nur, wenn Räume gemietet

> **Plugin-System** unter `packages/foerderbereiche/` hält die
> Pflichtfelder pro FB als Daten — nicht im UI verdrahtet.

---

## Architektur

```
[Bürger:in]
   │  optionaler ?prefill=einreichung_id (aus UE0)
   ▼
[Vite/React/TS Webformular]
   ├─ Sprach-Picker (i18n via i18next)
   ├─ Stepper (Phase 1: Stamm → 2: FB-spezifisch → 3: Anlagen)
   ├─ FB-Plugin (Pflichtfeld-Liste je FB-Variante)
   ├─ Live-Validation (IBAN-Mod-97, E-Mail-RFC, PLZ-Lookup)
   └─ Sticky-Progress
   │  Submit
   ▼
[Edge Function `submit-antrag`]
   ├─ Server-Validierung (Defense-in-Depth)
   └─ INSERT apl.antraege
   │
   ▼
[apl.antraege → UE2/UE3-Inbox]
```

---

## Kern-Mechanismus — Plugin-System für Förderbereiche

```ts
// packages/foerderbereiche/src/fb3.ts
export const fb3: FBConfig = {
  id: 'III',
  varianten: ['A', 'B', 'C', 'D'],
  pflichtfelder: (variante) => {
    const base = ['einrichtung_name', 'adresse', 'iban', 'bic', ...];
    if (variante === 'C') return [...base, 'c_quartier_person_name'];
    return base;
  },
  anlagen: (state) => [
    'wochenplan',
    ...(state.raeume_gemietet ? ['mietvertrag'] : [])
  ],
};
```

**Vorteil:** UE1, UE3 und UE4 lesen aus **derselben Quelle** —
keine doppelte Wahrheit, keine Drift.

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

<!-- Speaker-Notiz: vor der Demo eine UE0-Einreichung anstoßen, damit
die Prefill-Demo nahtlos läuft. Türkisch zeigen ist meist der
„Aha"-Moment. -->

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
- **Kein KI-Vorschlag** — der Antrag wird so eingereicht, wie er
  eingegeben wurde

---

## Voraussetzungen / Risiken

**Technisch:**
- Frontend-Toolchain (Vite/React/TS, i18next)
- Plugin-System mit guten Typen
- Storage für Anlagen (mit RLS + signed URLs)

**Organisatorisch:**
- Übersetzungen rechtssicher prüfen (Amt haftet für Inhalte!)
- Datenschutz: alle Eingaben vor Submit nur im Browser
- Klar definiert: was passiert mit Halb-fertigen Anträgen?

**Risiken:**
- Falsche Übersetzung führt zu falschen Anträgen
- Mitigation: Originalsprache als „Quelle der Wahrheit" beim Submit
  mitspeichern

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
strukturiert eingibt · (c) UE2, weil Daten sauber ankommen · (d) UE3</small>

<!-- Speaker-Notiz: Lösungen: 1=a, 2=c, 3=b. „UE0 wird optional"
ist der wichtigste Take-Away. -->

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
| 💻 **Quellcode** | `ue1/webformular/` + `packages/foerderbereiche/` |

---

<!-- _class: lead -->

# Brücke zu UE2

Saubere Daten kommen jetzt im Amt an — aber die Sachbearbeitenden
verwalten sie immer noch in **Excel-Listen und Mail-Postfächern**.
**UE2** baut die richtige Verwaltungs-IT dahinter: geteilte Inbox,
Workflow-Engine, Audit-Trail.

> **Frage zum Mitnehmen:** Wie viel Effizienz gewinnt UE1 für die
> Sachbearbeitenden — wenn dahinter noch immer ein Mail-Prozess steckt?
