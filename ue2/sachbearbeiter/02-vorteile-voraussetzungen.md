# 02 — Vorteile, Grenzen, Voraussetzungen

## Was diese Stufe gewinnt

| Aspekt | Mail-Postfach heute | Sachbearbeiter-Cockpit UE2 |
|--------|---------------------|-----------------------------|
| Eingangsbestätigung an Bürger | unsicher, manuell | automatisch, mehrsprachig, sofort |
| Sichtbarkeit im Amt | wer öffnet die Mail zuerst? | alle sehen den Antrag in Echtzeit in der Inbox |
| Statusverwaltung | Excel / Akten-Deckel | Workflow-Engine in der DB |
| Wer hat was wann gemacht? | Gedächtnis + handschriftliche Notizen | revisionssicherer Audit-Trail in `apl2.antrag_history` |
| Verbotene Statusübergänge | „der Praktikant hat ‚abgelehnt' geklickt statt ‚in Prüfung'" | Postgres-Trigger blockiert serverseitig |
| Anlagen-Zugriff | Mail-Anhang oder Papier-Akte | signierter Download aus dem geschützten Storage |
| Zugriffskontrolle | Mailbox-Passwort | Magic-Link + Allowlist + RLS auf jeder Tabelle |
| Multi-Mandanten | jede Mail-Adresse eigene Mailbox | gleicher Cockpit, RLS-getrennte Schemas möglich |

## Was diese Stufe nicht löst

- **Keine inhaltliche Prüfung** des Antrags — Sachbearbeitung liest und bewertet selbst (UE3)
- **Kein automatischer Bescheid-Entwurf** (UE3)
- **Kein Vergleich mit dem Vorjahresantrag** (UE3)
- **Kein Risiko-Score / keine Priorisierung der Inbox** (UE3)
- **Keine externe Träger-Recherche** (UE3, Perplexity)
- **Rollen-Modell ist bewusst flach** — alle Allowlist-User dürfen alles. Differenzierte Rollen (Erstprüfer/Zweitprüfer/Leiter) kommen optional als Erweiterung (UE3 macht das für den Zweitprüfer)
- **Kein Login per eID / BayernID** — Demo nutzt Magic-Link, in Produktion gehört eine echte SSO-Anbindung

## Voraussetzungen für diese Stufe

### Technisch
- Hosting mit eigener Domain + TLS (z.B. VPS + Traefik/Let's Encrypt) — kein GH Pages mehr, weil Bürger-getrennte Verwaltungs-Anwendung
- Supabase-Instanz mit:
  - Migrationen 007–014 (Workflow-Tabelle, History-Trigger, Allowlist, RLS auf `apl2.antraege`)
  - **Realtime aktiviert** für `apl2.antraege` und `apl2.antrag_history`
  - SMTP-Konfiguration für Magic-Link-Mails (GoTrue)
- n8n mit dem Workflow `n8n-apl2-eingangsbestaetigung.json` aktiv + SMTP-Credential (z.B. Gmail App-Password oder eigener Mailserver)
- Docker + Traefik auf dem VPS für das Frontend-Container (Multi-Stage-Build mit Nginx-Unprivileged)

### Organisatorisch
- **Allowlist pflegen** — `apl2.allow_email` ist das Tor; ohne Eintrag kein Zugang
- **Workflow-Schritte fachlich abgestimmt** — welche Statuswerte braucht ihr wirklich? Die Demo hat 5 (eingegangen / in_pruefung / rueckfrage / bewilligt / abgelehnt); in echten Verfahren oft mehr
- **Mail-Texte juristisch absegnen** — die Eingangsbestätigung ist eine offizielle Kommunikation; Wortlaut sollte das Sozialreferat freigegeben haben
- **Mehrsprachigkeit pflegen** — die Mail ist 4-sprachig, Wechsel der Förderrichtlinien-Wortlaute müssen in allen Sprachen nachgezogen werden

### Rechtlich
- **Volle DSGVO**: Verarbeitungsverzeichnis, AVV mit Hosting + n8n-Hoster + SMTP-Provider, Löschkonzept (typisch: 5 Jahre nach Bescheid)
- **Audit-Trail** ist DSGVO-konform und behördlich erwünscht (Nachvollziehbarkeit), muss aber im Löschkonzept mitabgedeckt sein
- **Magic-Link-Mails enthalten Auth-Tokens** — gehen über SMTP (in der Demo: Gmail). In Produktion gehört der Versand über einen vertraglich gebundenen Anbieter
- **Signierte Storage-URLs** für Anlagen haben eine Lebensdauer (Default 1 h) — das ist gut, weil weitergeleitete Links nicht ewig gültig bleiben
- **Kein eigener Login** — wer einen Magic-Link erhält, ist eingeloggt. Allowlist + 2FA wäre in Produktion sinnvoll (Supabase Auth unterstützt das via TOTP)

### Sicherheits-Härtung (Defense-in-Depth)
- **RLS auf jeder Tabelle** — auch wenn das Frontend sich richtig verhält, blockt die DB unautorisierte Reads/Writes
- **Workflow-Trigger** validiert verbotene Status-Übergänge auf DB-Ebene — Frontend-Bugs können den Workflow nicht kaputtmachen
- **Traefik-PathPrefix** vor Supabase-Kong — extern erreichbar sind nur GoTrue (Auth), Realtime-Socket und die Edge Function `submit-antrag`. Alles andere 404.
