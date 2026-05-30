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

## Tech-Stack & Tools

| Komponente | Wahl | Begründung |
|---|---|---|
| Frontend | Vite/React/TS, Tailwind 4 | konsistent mit UE1 |
| Auth | Supabase GoTrue (Magic-Link) | passwordless, weniger Phishing-Fläche |
| Allowlist | RLS-Policy gegen `apl.allow_email` | Zugang ohne Code-Deploy steuerbar |
| Realtime | Supabase Realtime (`postgres_changes` über WebSocket) | Push-Updates ohne Polling |
| Workflow | `apl.workflow_transition` + Postgres-Trigger | Daten statt Code, defense-in-depth |
| Audit | Postgres-Trigger auf `apl.antraege` → `apl.antrag_history` | revisionssicher, automatisch |
| Mail | n8n-Workflow `eingangsbestaetigung` mit Switch-Node (4 Sprachen) | visuelle Pipeline, leicht erweiterbar |
| Pool/Watchdog | PostgREST Pool-Tuning + systemd-Watchdog | Stabilität nach „5h-Login-Krise" 2026-05-30 |

---

## Architektur

```
[Bürger:in / UE0 / UE1]
   │  INSERT apl.antraege
   ▼
┌──────────────────────────────────────┐
│ Postgres (`apl.antraege`)             │
│   ├─ pg_notify('antrag_neu', id)      │
│   └─ Realtime-Stream → WebSocket      │
└──────────────────────────────────────┘
   │                            │
   │ Webhook                    │ WebSocket
   ▼                            ▼
┌─────────────────────┐   ┌─────────────────────────┐
│ n8n „eingangs-       │   │ Sachbearbeiter-Frontend │
│  bestaetigung"       │   │  - Inbox (Realtime)     │
│  → SMTP (4 Sprachen)│   │  - AntragDetail         │
└─────────────────────┘   │  - Status-Select        │
   │                       │  - History-Timeline     │
   ▼                       └─────────────────────────┘
[Bürger-Mail]                       │
                                    │ UPDATE status
                                    ▼
                          ┌─────────────────────────┐
                          │ Trigger:                 │
                          │  - validate_transition() │
                          │  - INSERT antrag_history │
                          └─────────────────────────┘
```

---

## Sequenz-Diagramm

```
SB-Browser    GoTrue       Postgres        Realtime       n8n        SMTP
   │             │             │              │             │           │
 1 │ POST /otp ─▶│             │              │             │           │
 2 │             │── INSERT auth.users ──────▶│             │           │
 3 │             │── send link ──────────────────────────────────────▶ Mail
 4 │ Klick im Mail-Link                       │             │           │
 5 │ GET callback?token=… ▶│                  │             │           │
 6 │             │── verify, INSERT session ─▶│             │           │
 7 │◀─ setSession JWT ─────│                  │             │           │
 8 │ SELECT allow_email (RLS USING true) ────▶│             │           │
 9 │◀── match → /inbox ─────────────────────────────────────│           │
10 │ subscribe channel('antraege') ─────────────────────────▶          │
11 │ (anderer Bürger reicht ein) → INSERT antraege          │           │
12 │◀── Realtime payload {INSERT, row} ─────────────────────│           │
13 │ Status-Change UPDATE ─────────────────▶│              │           │
14 │             │             │  Trigger: validate + INSERT history    │
15 │◀── Realtime payload {UPDATE, row} ─────────────────────│           │
```

<!-- Speaker-Notiz: Schritte 10-15 sind der Realtime-Showcase.
Zwei Browser-Tabs nebeneinander zeigen den Effekt sofort. -->

---

## Datenmodell

```sql
-- apl.workflow_transition — Workflow als Daten
CREATE TABLE apl.workflow_transition (
  alt_status  TEXT NOT NULL,
  neu_status  TEXT NOT NULL,
  PRIMARY KEY (alt_status, neu_status)
);
INSERT INTO apl.workflow_transition VALUES
  ('eingegangen',    'in_pruefung'),
  ('in_pruefung',    'eingegangen'),
  ('in_pruefung',    'zurueckgewiesen'),
  ('in_pruefung',    'bewilligt'),
  ('in_pruefung',    'abgelehnt'),
  ('zurueckgewiesen','in_pruefung');

-- apl.antrag_history — Audit-Trail (trigger-befüllt)
CREATE TABLE apl.antrag_history (
  id          BIGSERIAL PRIMARY KEY,
  antrag_id   UUID NOT NULL REFERENCES apl.antraege(id),
  event_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_email  TEXT NOT NULL,
  event_type  TEXT NOT NULL,                  -- 'status_change' | …
  alt_status  TEXT, neu_status TEXT,
  kommentar   TEXT
);
CREATE INDEX ON apl.antrag_history (antrag_id, event_at DESC);

-- apl.allow_email — Allowlist
CREATE TABLE apl.allow_email (
  email   CITEXT PRIMARY KEY,
  rolle   TEXT NOT NULL DEFAULT 'sachbearbeiter',
  aktiv   BOOLEAN NOT NULL DEFAULT true
);
-- RLS: jede:r authenticated darf lesen (USING true),
-- aber Insert/Update nur service_role
ALTER TABLE apl.allow_email ENABLE ROW LEVEL SECURITY;
CREATE POLICY sel_auth ON apl.allow_email
  FOR SELECT TO authenticated USING (true);
```

---

## Kern-Mechanismus — Workflow-Trigger als Defense-in-Depth

```sql
CREATE FUNCTION apl.validate_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT EXISTS (
      SELECT 1 FROM apl.workflow_transition
      WHERE alt_status = OLD.status AND neu_status = NEW.status
    ) THEN
      RAISE EXCEPTION 'Ungültiger Status-Übergang: % → %',
        OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    -- Audit-Trail automatisch
    INSERT INTO apl.antrag_history
      (antrag_id, user_email, event_type, alt_status, neu_status, kommentar)
    VALUES
      (NEW.id, current_setting('request.jwt.claim.email', true),
       'status_change', OLD.status, NEW.status, NEW.kommentar_letzte_aenderung);
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER tr_validate_status
  BEFORE UPDATE ON apl.antraege
  FOR EACH ROW EXECUTE FUNCTION apl.validate_status_transition();
```

**Defense-in-Depth:**
- Client (TS-Map in `workflow.ts`) zeigt nur erlaubte Übergänge
- Server (Trigger oben) lehnt unerlaubte Übergänge ab
- DevTools-Manipulation → Insert wird mit `check_violation` abgelehnt

---

## Sicherheits- & Schutzschicht

| Schicht | Mechanismus | Schutz vor |
|---|---|---|
| Auth | Magic-Link über GoTrue + SMTP | Phishing, Passwort-Wiederverwendung |
| Allowlist | `apl.allow_email` mit RLS-Lookup | unautorisierter Zugang trotz JWT |
| RLS auf allen Tabellen | `authenticated` SELECT/UPDATE, `service_role` für Backend | Anon-Key-Leak schadet nicht |
| Workflow-Trigger | Postgres lehnt unerlaubte Übergänge ab | Frontend-Manipulation |
| Audit-Trigger | Jede Änderung erzeugt History | Beweissicherheit |
| Storage | signed URLs (TTL 10 min) für Anlagen | Direkt-Download |
| Pool | `statement_timeout=5min` auf `authenticator` + DB | Lange Queries blockieren Auth |
| Watchdog | systemd-Timer prüft alle 60 s, restart bei 2 Fails | Kong/PostgREST/GoTrue-Hänger |

---

## Performance & Skalierung

| Metrik | Wert | Anmerkung |
|---|---|---|
| Initial Load Inbox | ~ 400 ms p50 | mit ~ 200 Anträgen |
| Realtime-Latenz Status-Change | < 200 ms in zweitem Tab | WebSocket-Push |
| Magic-Link-Roundtrip | ~ 2,5 s | dominiert vom SMTP |
| PostgREST Connection Pool | 15 + 5 (idle/active), 5 min idle TTL | Pool-Tuning Migration 070 |
| DB-Connections gesamt | ≤ 50 (PgBouncer transaction-Pooling) | Watchdog-überwacht |
| Audit-Trail-Insert | ~ 8 ms | Trigger-Overhead vernachlässigbar |
| Eingangsbestätigung (n8n) | ~ 1,2 s bis SMTP-Übergabe | per Bürger asynchron |

**Bottlenecks & Mitigationen (Lektion 2026-05-30):**
- Lange Doctree-Queries blockierten Schema-Cache (`PGRST002`)
  → `statement_timeout=5min` setzen
- Container-Cascade analytics→auth → `docker compose --no-deps`
- CORS-Negative-Cache (10 min) → harter SITE_URL-Setzung + Inkognito

---

## Live-Demo

🌐 **<https://sachbearbeiter.butscher.cloud/login>**

1. Magic-Link mit freigeschalteter E-Mail anfordern
2. Mail-Link klicken → Diagnose-Card mit 4 grünen Häkchen
3. Inbox lädt — alle Anträge sichtbar
4. Antrag öffnen → Status auf „in Prüfung" wechseln
5. **Zweites Browser-Fenster:** Status-Änderung erscheint in Echtzeit
6. History-Timeline zeigt: wer/wann/was/Kommentar

<!-- Speaker-Notiz: Realtime mit 2 Tabs zeigen — „Ich klicke hier,
schau drüben". -->

---

## Chancen

- **Schluss mit Doppelarbeit** — alle sehen denselben Zustand
- **Compliance-fähig** durch revisionssicheren Audit-Trail
- **Skaliert** auf neue Verfahren ohne Code-Änderung
- **Rollenmodell pro Sachbearbeiter:in** über RLS möglich
- **Bürger:in fühlt sich abgeholt** durch automatische Bestätigung
- **Krankheit/Urlaub** kein Wissensverlust mehr
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
- PostgREST/Auth Pool-Tuning + Watchdog

**Organisatorisch:**
- Klare Status-Definitionen, Workshop mit Sachbearbeitenden
- Allowlist-Prozess: Wer pflegt sie?
- AV-Vertrag mit Cloud-Anbieter
- Schulung: alle über die Inbox, nicht mehr über Mail

**Risiken:**
- „Schatten-Excel" überlebt — Schulung + Konsequenz nötig
- Mail-Postfach bleibt aktiv — Übergangs-Regel definieren

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

<!-- Speaker-Notiz: Lösungen: 1=b, 2=b, 3=c. -->

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
| 💻 **Quellcode** | `ue2/sachbearbeiter/` + `supabase/migrations/{007,008,080,081}` |

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
