---
marp: true
theme: default
paginate: true
header: "UE2 · Manuelle Sachbearbeitung · Reifegradstufe 2"
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

<span class="pill">REIFEGRADSTUFE 2</span>

# Sachbearbeiter-Cockpit

**Vom geteilten Mail-Postfach zur Workflow-Engine mit Audit-Trail.
Realtime-Inbox, Magic-Link-Auth, automatische Eingangsbestätigung —
alles ohne KI.**

<small>Fallstudie AHP Würzburg · Modul Innovationsmanagement BBA · Dr. Robert Butscher · 2026</small>

<!-- Speaker-Notiz: Die unsichtbare Stufe — Bürger:innen merken
nichts davon, aber für die Verwaltung ist das die größte
organisatorische Veränderung der ganzen Fallstudie. -->

---

## Lernziele

Nach dieser UE können Sie:

1. **Wissen** — was eine Workflow-Engine ist und warum sie einer
   Excel-Liste überlegen ist.
2. **Verstehen** — wie Magic-Link-Auth, RLS und Audit-Trail
   zusammenspielen.
3. **Anwenden** — einen neuen Status-Übergang in der Workflow-Engine
   ergänzen.
4. **Beurteilen** — wann eine Verwaltung diese Stufe einführen sollte
   und welche organisatorischen Voraussetzungen nötig sind.

---

## Ausgangslage — das geteilte Mail-Postfach

- Antrag landet als PDF in `antrag@stadt.wuerzburg.de`
- Mehrere Sachbearbeitende greifen darauf zu, niemand weiß, wer was
  schon angefasst hat
- Bürger:in bekommt keine automatische Eingangsbestätigung →
  ruft nach 2 Wochen an: „ist mein Antrag da?"
- Statusänderungen in Excel-Listen oder am Papier-Akten-Deckel
- Bei Krankheit/Urlaub: Kollegen wissen nicht, wo der Vorgang steht

> **Das ist nicht digital. Das ist „Papier mit Bildschirm-Adapter".**

---

## Problemstellung

| Schmerzpunkt | Wirkung |
|---|---|
| Niemand sieht „wer macht was" | Doppelarbeit, vergessene Vorgänge |
| Status nur in Köpfen / Excel | Auskunft ans Telefon kaum möglich |
| Praktikant:innen können alles | Datenschutz-Risiko |
| Statusänderungen ohne Begründung | nicht nachvollziehbar bei Beschwerden |
| Eingangsbestätigung manuell | inkonsistent, oft vergessen |
| Anhänge: Mail → Drucker → Akte | Medienbrüche, verlorene Anlagen |

> **Kernproblem:** Es gibt keine **Quelle der Wahrheit** für
> Vorgangs-Status.

---

## Reifegradmodell — wo wir stehen

| Stufe | Was neu ist | Bürger | Amt |
|---|---|---|---|
| UE0 | PDF-Upload + KI-OCR | = | ↓↓ |
| UE1 | Strukturiertes Webformular | ↑ | ↓↓↓ |
| **UE2** (jetzt) | **Sachbearbeiter-UI (manuell)** | **=** | **↓** |
| UE3 | KI-Empfehlung (Mensch entscheidet) | = | ↓↓↓ |
| UE4 | Konversationeller Agent | ↓↓ | ↓↓↓ |

> UE2 ist die **erste Stufe mit echter Verwaltungs-IT** — geteilte
> Inbox, Workflow-Engine, Audit-Trail, aber **noch ohne KI**.

---

## Herangehensweise

**Idee:** Den Vorgangs-Status zur ersten Klasse machen.

1. **Geteilte Inbox in Echtzeit** für alle Sachbearbeitenden (statt Mail)
2. **Workflow-Engine in der DB** als alleinige Wahrheit über Status
3. **Postgres-Trigger** blockt verbotene Übergänge serverseitig
4. **Jede Änderung erzeugt automatisch History-Eintrag** (Audit-Trail)
5. **Magic-Link-Login** + Allowlist statt Passwörter
6. **n8n verschickt** automatische Eingangsbestätigung in 4 Sprachen

> **Datengetriebener Workflow > if-else im Code.**

---

## Architektur

```
[Antrag aus UE0/UE1]
   │
   ▼
[INSERT apl.antraege] — pg_notify → [n8n: Mail in 4 Sprachen]
   │
   │  Realtime-Channel
   ▼
[Sachbearbeiter:innen sehen neuen Antrag SOFORT in Inbox]
   │
   │  Klick → AntragDetail
   ▼
[Status-Select prüft erlaubte Übergänge (Client + Server)]
   │
   │  UPDATE apl.antraege SET status = …
   ▼
[Trigger: INSERT apl.antrag_history (wer/wann/was/Kommentar)]
```

Magic-Link-Auth → Allowlist-Check (RLS) → Inbox.

---

## Kern-Mechanismus — Workflow als Daten

```sql
-- apl.workflow_transition
('eingegangen',    'in_pruefung'),
('in_pruefung',    'eingegangen'),
('in_pruefung',    'zurueckgewiesen'),
('in_pruefung',    'bewilligt'),
('in_pruefung',    'abgelehnt'),
('zurueckgewiesen','in_pruefung');

-- Trigger blockt alles, was NICHT in dieser Tabelle steht
```

**Defense-in-Depth:**
- Frontend (TypeScript-Map) zeigt nur erlaubte Übergänge
- Server (Postgres-Trigger) erzwingt sie nochmal
- Auch DevTools-Manipulation → Insert wird abgelehnt

---

## Live-Demo

🌐 **<https://sachbearbeiter.butscher.cloud/login>**

1. Magic-Link mit freigeschalteter E-Mail anfordern
2. Mail-Link klicken → Diagnose-Card mit 4 grünen Häkchen
3. Inbox lädt — alle Anträge sichtbar
4. Antrag öffnen → Status auf „in Prüfung" wechseln
5. **Zweites Browser-Fenster:** Status-Änderung erscheint in Echtzeit
6. History-Timeline zeigt: wer/wann/was/Kommentar

<!-- Speaker-Notiz: Den Realtime-Effekt unbedingt mit 2 Tabs zeigen —
„Ich klicke hier, schau drüben". Magic-Link in der echten Mail
checken, sonst sieht es wie ein Spielzeug aus. -->

---

## Chancen

- **Schluss mit Doppelarbeit** — alle sehen denselben Zustand
- **Compliance-fähig** durch revisionssicheren Audit-Trail
- **Skaliert** auf neue Verfahren ohne Code-Änderung
- **Rollenmodell pro Sachbearbeiter:in** über RLS möglich
- **Bürger:in fühlt sich abgeholt** durch automatische Bestätigung
- **Krankheit/Urlaub** kein Wissensverlust mehr — Status sichtbar
- **Vorbereitung für UE3** — die KI baut auf dieser Datenstruktur auf

---

## Einschränkungen / Grenzen

- **Keine inhaltliche Prüfung** des Antrags (das macht erst UE3)
- **Sachbearbeitende müssen alles selbst lesen** — keine Empfehlung
- **Kein automatischer Bescheid** (Word-Datei wird per Hand erstellt)
- **Allowlist-Pflege nur per SQL** (kein Sachbearbeiter-UI)
- **Volle Revisionssicherheit** bräuchte WORM-Storage oder Blockchain
- **service_role** im Backend kann Trigger umgehen — operative Hygiene
  notwendig

---

## Voraussetzungen / Risiken

**Technisch:**
- Postgres mit Realtime + RLS + Triggers
- Magic-Link-Service (Supabase Auth oder eigenes)
- n8n oder ähnliche Workflow-Engine für Mails

**Organisatorisch:**
- Klare Status-Definitionen, Workshop mit Sachbearbeitenden
- Allowlist-Prozess: Wer pflegt sie?
- AV-Vertrag mit Cloud-Anbieter (Supabase, SMTP)
- Schulung: alle gehen über die Inbox, nicht mehr über Mail

**Risiken:**
- „Schatten-Excel" überlebt — Schulung + Konsequenz nötig
- Mail-Postfach bleibt — was wenn doch jemand mailt?

---

## Selbstreflexion

> Beantworten Sie für sich diese 4 Fragen:

1. **Welche organisatorische Veränderung ist schwieriger — Excel raus
   oder Mail raus? Warum?**
2. **Wer haftet für einen falschen Status-Übergang, wenn der
   Audit-Trail sagt: „Praktikant:in hat ‚bewilligt' geklickt"?**
3. **Wann ist Magic-Link sicherer als Passwort — und wann nicht?**
4. **UE2 macht keine inhaltliche Prüfung — wann ist das genug
   und wann ist es zu wenig?**

---

## Übungsfragen

**Frage 1:** Was passiert bei einem verbotenen Status-Übergang?
<small>(a) wird gespeichert, Warnung im UI · (b) Trigger blockt
serverseitig, Insert fehlschlägt · (c) Sachbearbeiter:in entscheidet ·
(d) UE3-KI prüft</small>

**Frage 2:** Wer kann die Inbox sehen?
<small>(a) jede:r mit Link · (b) nur Sachbearbeitende mit
Allowlist-Eintrag · (c) auch Bürger:innen · (d) nur der Bürgermeister</small>

**Frage 3:** Was ist die „Quelle der Wahrheit" für Vorgangsstatus?
<small>(a) Excel · (b) Akten-Deckel · (c) <code>apl.antraege.status</code>
+ <code>apl.antrag_history</code> · (d) Mail-Postfach</small>

<!-- Speaker-Notiz: Lösungen: 1=b, 2=b, 3=c. „Quelle der Wahrheit"
ist der Schlüsselbegriff der ganzen UE. -->

---

## Mitmach-Aufgaben (Vertiefung)

| Code | Titel | Aufwand | ⭐ |
|---|---|---|---|
| A | Status-Filter in der Inbox (Pill-Buttons) | 30 Min | ⭐ |
| B | Neuer History-Event-Type („Anlage hinzugefügt") End-to-End | 90 Min | ⭐⭐ |
| C | 5. Sprache (Polnisch) im n8n-Eingangsbestätigungs-Workflow | 45 Min | ⭐⭐ |
| D | Neuen Sachbearbeitenden per <code>apl.allow_email</code> freischalten | 20 Min | ⭐ |

Detail: **`ue2/sachbearbeiter/04-aufgaben.md`**

---

## Materialien & Ressourcen

| Ressource | Pfad / URL |
|---|---|
| 🌐 **Live-Demo** | <https://sachbearbeiter.butscher.cloud/login> |
| 📚 **Selbstlern-Modul (HTML)** | [`selbstlern.html`](./selbstlern.html) |
| 📝 **Konzept-Markdown** | [`01-konzept.md`](./01-konzept.md) |
| ⚖️ **Vorteile / Voraussetzungen** | [`02-vorteile-voraussetzungen.md`](./02-vorteile-voraussetzungen.md) |
| 🛠 **Dozent-Walkthrough** | [`03-walkthrough.md`](./03-walkthrough.md) |
| ✏️ **Studi-Aufgaben** | [`04-aufgaben.md`](./04-aufgaben.md) |
| 💻 **Quellcode** | `ue2/sachbearbeiter/` + `supabase/migrations/` |

---

<!-- _class: lead -->

# Brücke zu UE3

Die Sachbearbeitenden sehen jetzt alles — aber sie müssen **immer noch
die ganze 35-seitige Förderrichtlinie pro Antrag im Kopf haben**.
**UE3** legt eine KI-Empfehlungsschicht darüber: Erst-KI, adversarielle
Zweit-KI, externe Validierung, Compliance-Cockpit.

> **Frage zum Mitnehmen:** Welche Aufgaben sollten KI übernehmen,
> welche nicht? Wo verläuft die Grenze, hinter der „Mensch entscheidet"
> mehr ist als Show?
