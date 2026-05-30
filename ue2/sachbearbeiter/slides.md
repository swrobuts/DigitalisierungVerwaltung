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

Vom geteilten Postfach zur Workflow-Engine mit Audit-Trail. Realtime-Inbox, Magic-Link-Auth, vierfach-sprachige Eingangsbestätigung — alles ohne KI.

<small>Fallstudie AHP Würzburg · Modul Innovationsmanagement BBA · Dr. Robert Butscher</small>

---

## Heute: Mail-Postfach + Excel

- Antrag liegt als PDF im Mail-Postfach oder gemeinsamen Account
- Mehrere Sachbearbeitende greifen drauf zu, niemand weiß wer was bearbeitet
- Bürger:in bekommt keine Eingangsbestätigung → unsicher
- Statusänderungen in Excel-Listen oder am Papier-Akten-Deckel
- Bei Anruf des Bürgers: „Da müsste ich mal nachschauen…"

> Das ist nicht digital. Das ist „Papier mit Bildschirm-Adapter".

---

## Reifegradstufen — wo wir sind

| Stufe | Was neu ist | Bürger | Amt |
|---|---|---|---|
| UE0 | PDF-Upload + KI-OCR | = | ↓↓ |
| UE1 | Webformular | ↑ | ↓↓↓ |
| **UE2** (heute) | **Sachbearbeiter-UI (manuell)** | = | ↓ |
| UE3 | KI-Vorschlag (Empfehlung) | = | ↓↓↓ |
| UE4 | Konversationeller Agent | ↓↓ | ↓↓↓ |

UE2 ist die **erste Stufe mit echter Verwaltungs-IT** — geteilte Inbox,
Workflow-Engine, Audit-Trail, aber **noch ohne KI-Unterstützung**.

---

## UE2 in einem Bild

```
[Antrag wird via UE0/UE1 eingereicht]
   |
   v
[INSERT apl.antraege] -- pg_notify -->  [n8n: Eingangsbestätigungs-Mail]
   |                                         (4 Sprachen via Switch-Node)
   |                                         |
   |                                         v
   |                                    [Bürger:in: Mail ✓]
   v
[Realtime-Inbox bei UE2-Sachbearbeitenden]
   |
   | Magic-Link-Login → Allowlist-Check (apl.allow_email)
   v
[Inbox: alle Anträge in Echtzeit]
   |
   | Klick auf Antrag
   v
[AntragDetail]
   ├── Stammdaten (read-only)
   ├── Anlagen-Liste mit signed-URL-Download
   ├── Status-Select (nur erlaubte Übergänge)
   ├── History-Timeline (wer/wann/was/warum)
   └── Bescheid-Word-Erstellung
```

---

## Live-Demo

🌐 **<https://sachbearbeiter.butscher.cloud/login>**

1. Magic-Link mit freigeschalteter E-Mail anfordern
2. Mail-Link klicken → Callback-Diagnose-Card (4 grüne Häkchen)
3. Inbox lädt — 6 Demo-Anträge sichtbar
4. Klick auf Antrag → Detail-Sicht
5. Status auf „in Prüfung" wechseln → Realtime-Update auch in zweitem Tab

<small>Diagnose-Card auf /login zeigt sofort, wenn was klemmt</small>

---

## Was UE2 gewinnt

| Aspekt | Mail-Postfach | UE2 |
|---|---|---|
| Eingangsbestätigung | manuell oder gar nicht | automatisch in 4 Sprachen |
| Sichtbarkeit im Amt | „wer öffnet zuerst?" | alle Echtzeit-Inbox |
| Statusverwaltung | Excel / Akten-Deckel | Workflow-Engine in DB |
| Wer hat was wann? | Gedächtnis | revisionssicherer Audit-Trail |
| Verbotene Übergänge | „Praktikant hat ‚abgelehnt' geklickt" | Postgres-Trigger blockiert |
| Anlagen-Zugriff | Mail-Anhang/Papier | signed Download aus Storage |
| Zugriffskontrolle | Mailbox-Passwort | Magic-Link + Allowlist + RLS |

---

## Was UE2 nicht löst

- **Keine inhaltliche Prüfung** des Antrags (UE3 mit KI-Vorschlag)
- **Kein automatischer Bescheid-Entwurf** (UE3)
- **Kein Vergleich mit Vorjahresantrag** (UE3)
- **Keine Risiko-Bewertung** (UE3)
- **Kein adversarieller Zweitprüfer** (UE3)
- **Keine externe Validierung** (Perplexity etc. — UE3)
- **Sachbearbeitende lesen + entscheiden komplett selbst**
- Allowlist-Pflege nur per SQL (kein UI)

---

## Workflow-Engine — das Herzstück

Erlaubte Status-Übergänge in `apl.workflow_transition`:

```sql
eingegangen     → in_pruefung
in_pruefung     → eingegangen | zurueckgewiesen | bewilligt | abgelehnt
zurueckgewiesen → in_pruefung
bewilligt       → (final)
abgelehnt       → (final)
```

**Defense-in-Depth:** Client (TS-Map) UND Server (Postgres-Trigger)
validieren — Manipulation via DevTools wird abgelehnt.

> Lehrreich: Datengetriebener Workflow ist um Größenordnungen
> robuster als „if (status === 'foo')" im Code.

---

## Audit-Trail

`apl.antrag_history`-Zeile:

| Spalte | Beispiel |
|---|---|
| `event_at` | 2026-05-30 14:23:15 UTC |
| `user_email` | sachbearbeiter@stadt.wuerzburg.de |
| `event_type` | status_change |
| `alt_status` | eingegangen |
| `neu_status` | in_pruefung |
| `kommentar` | „Wartet auf Helferliste" |

**Trigger-basiert**: jeder UPDATE auf `apl.antraege` erzeugt
automatisch einen Eintrag. Frontend muss nichts dafür tun.

> Grenze: wer mit `service_role` direkt arbeitet, bypasst den Trigger.
> Echte Revisionssicherheit bräuchte WORM-Storage oder eine Blockchain.

---

## Magic-Link-Auth Flow

```
[Bürger:in / Sachbearbeitende]
  → POST /auth/v1/otp (email)
  → GoTrue → SMTP → Mail mit Link
  → Klick auf Mail-Link
  → GoTrue verifiziert Token
  → Browser: /auth/callback#access_token=...
  → setSession() → localStorage
  → allow_email-Lookup (RLS-Policy `USING (true)` für authenticated)
  → wenn Allowlist-Match → /inbox
  → wenn nicht → /login
```

**Live-Diagnose-Card** auf /login zeigt jeden Schritt — kein
Raten mehr, wenn was klemmt (Lektion vom 2026-05-30).

---

## ⚖️ Sicherheit

- **Magic-Link** statt Passwort (keine Phishing-anfälligen Credentials)
- **Allowlist** (`apl.allow_email`) — nur freigeschaltete E-Mails kommen rein
- **RLS auf jeder Tabelle** — auch wenn Anon-Key geleakt wird, kann
  nichts ausgelesen werden
- **Signed URLs für Storage-Downloads** (10-min-Gültigkeit)
- **Postgres-Trigger** als Defense-in-Depth für Workflow-Übergänge
- **CORS-Whitelist** in GoTrue für alle berechtigten Origins
- **Pool-Tuning** + Watchdog (Lektion 2026-05-30) für Stabilität

---

## Code-Walkthrough (5 Stellen)

1. **`src/lib/workflow.ts`** — Status-Union, Labels, erlaubte
   Übergänge als reine Map. Spiegel der DB-Tabelle.
2. **`src/hooks/useAntraege.ts`** — Realtime-Hook (Initial-Load +
   `postgres_changes`-Channel), idempotenter Merge.
3. **`src/pages/Inbox.tsx`** — Listen-Ansicht, FB-Filter,
   Sortier-Spalten, StatusBadge.
4. **`src/pages/AntragDetail.tsx`** — 4-Bereich-View: Stammdaten,
   Anlagen, Status-Select, History.
5. **`supabase/webhooks/n8n-apl2-eingangsbestaetigung.json`** — Mail-
   Workflow mit Switch-Node für 4 Sprachen.

---

## Mitmach-Aufgaben

- **A** — Status-Filter in der Inbox (Pill-Buttons) · 30 Min · ⭐
- **B** — Neuer History-Event-Type „Anlage hinzugefügt" durch alle
  Schichten · 90 Min · ⭐⭐
- **C** — Fünfte Sprache (Polnisch) für Eingangsbestätigung im n8n
  · 45 Min · ⭐⭐
- **D** — Neuen Sachbearbeitenden über `apl.allow_email` freischalten
  + Login-Flow durchspielen · 20 Min · ⭐

Detail: **`ue2/sachbearbeiter/04-aufgaben.md`**

---

<!-- _class: lead -->

# Fragen?

**Nächste Stunde:** UE3 — die KI-Variante derselben Sachbearbeitung,
mit Empfehlungs-Cards und Compliance-Cockpit

<small>Materialien: <code>ue2/sachbearbeiter/{README, 01-konzept, 02-vorteile-voraussetzungen, 03-walkthrough, 04-aufgaben, slides, selbstlern}</code></small>
