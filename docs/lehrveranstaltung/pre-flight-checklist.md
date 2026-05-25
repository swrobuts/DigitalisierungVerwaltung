# Pre-Flight-Checkliste — Vorlesungs-Demo

**Vor jeder Vorlesung 30 Minuten Zeit nehmen und diese Checkliste durchgehen.**

---

## 1. Infrastruktur (15 min)

### 1.1 VPS-Status
```bash
ssh vps "docker ps --format '{{.Names}}\t{{.Status}}' | grep -E 'pruefung|amt-frontend|amt-ki-frontend|lve|n8n|supabase'"
```

**Erwartet:**
- `pruefung-service` Up (FB-Plugins + Hard-Fail-Validator)
- `amt-frontend` Up (UE2)
- `amt-ki-frontend` Up (UE3)
- `n8n` Up (OCR-Pipeline)
- `supabase-*` alle Up + healthy

Bei Problem: `docker compose up -d --force-recreate <service>` im jeweiligen `docker/`-Verzeichnis.

### 1.2 TTFB-Check
```bash
for url in https://upload.butscher.cloud https://antrag.butscher.cloud \
           https://sachbearbeiter.butscher.cloud https://ki.butscher.cloud \
           https://agent.butscher.cloud https://pruefung.butscher.cloud/api/health; do
  echo -n "$url: "
  curl -s -o /dev/null -w "%{time_starttransfer}s\n" "$url"
done
```

**Erwartet:** alle < 1.0 s (idealerweise < 500 ms).
Bei Problem: VPS-Last prüfen (`htop`), supabase-meta neu starten falls Zombies.

### 1.3 DB-Sanity
Supabase Studio öffnen → SQL Editor:
```sql
SELECT foerderbereich, count(*), array_agg(antragsnummer ORDER BY antragsnummer)
  FROM apl.antrag_inbox
 WHERE einrichtung LIKE 'DEMO-%'
 GROUP BY foerderbereich
 ORDER BY foerderbereich;
```
**Erwartet:** 6 DEMO-Anträge (FB I: 1, FB II: 1, FB III: 3, FB IV: 1) wie in Migration 067 angelegt.

```sql
SELECT count(*) FROM apl.ahp_norm_statements WHERE aktiv;
```
**Erwartet:** ≥ 12 (Migration 063 hat 12 Seed-Statements).

---

## 2. Funktions-Smoketest pro Reifegradstufe (10 min)

Pro UE einen 30-Sekunden-Walk-Through. **Browser-Cache vorher leeren** (Cmd+Shift+R).

### UE0 — Manueller PDF-Upload
1. https://upload.butscher.cloud öffnen
2. FB-Wahl: „Aufbau niedrigschwelliger Angebote" wählen
3. Demo-PDF aus `materialien/wuerzburg-2026/demo-ausgefuellt/fb-i-demo.pdf` (falls vorhanden) hochladen, sonst irgendein PDF
4. Erwartet: Upload erfolgreich, Status `wartend`, Tracking-Link funktioniert

### UE1 — Webformular
1. https://antrag.butscher.cloud öffnen
2. FB-Wahl: FB III („Bewährte Strukturen")
3. Variante C („Seniorenkreis") wählen
4. Antragsteller: Test-Daten ausfüllen (IBAN: `DE89370400440532013000`)
5. Pflichtfelder: treffen_schwelle GT_20, teilnehmer_durchschnitt 25
6. Submit → Antragsnummer im Format `APL-2026-FBIII-…` zurück

### UE2 — Bearbeiter-Inbox (klassisch)
1. https://sachbearbeiter.butscher.cloud öffnen, magic-link einloggen
2. Inbox zeigt FB-Spalte mit Badges
3. Filter-Pill „Engagement" anklicken → nur FB-II-Anträge sichtbar
4. Antrag öffnen, FB-spezifischer Block (z.B. Helferliste bei FB II) wird angezeigt
5. Status auf „in_pruefung" ändern → History-Eintrag

### UE3 — KI-Inbox
1. https://ki.butscher.cloud öffnen, magic-link einloggen
2. Smart-Upload öffnen, ein PDF reinwerfen
3. Klassifizierungs-Vorschlag erscheint (FB + Konfidenz)
4. AntragDetail eines Demo-Antrags öffnen
5. „Bescheid erzeugen" klicken
6. Erwartet: PDF mit korrekten § zitiert (alle aus `apl.ahp_norm_statements`)
7. Test-Case Halluzinations-Schutz: nochmal mit gezielt fehlerhaftem Antrag → 422-Fehler mit klarer Meldung

### UE4 — Agent-Portal
1. https://agent.butscher.cloud öffnen
2. „Hallo, wir sind die AWO Würzburg und wollen einen Besuchsdienst aufbauen" eintippen
3. Agent klassifiziert FB II, erklärt was er macht
4. Konversational durch Pflichtfelder geführt
5. Submit → Antragsnummer

---

## 3. Fallback-Material (5 min)

Falls ein UE während Live-Demo abstürzt:

- **Screenshots** in `docs/lehrveranstaltung/fallback-screenshots/` (1 pro UE, aktueller Stand)
- **Demo-Video** alternativ (siehe Notfall-Ordner auf Mac)
- **„Mock-Modus"** in UE3: Bei Backend-404 zeigt UE3 statt Spinner einen Hinweis „Demo-Backend nicht verfügbar — KI-Antworten aus letztem Test-Run".

---

## 4. Notfall-Aktionen

| Symptom | Aktion |
|---|---|
| pruefung-Service down | `ssh vps "cd /opt/pruefung/repo/pruefung/docker && docker compose restart"` |
| Supabase Studio langsam | `ssh vps "docker restart supabase-meta supabase-studio"` |
| Frontend zeigt Stale-Daten | Browser hard-refresh + localStorage löschen (DevTools → Application → Clear) |
| Demo-Daten verschoben/gelöscht | `bash scripts/demo-reset.sh` |
| KI antwortet halluziniert | Hard-Fail-Validator funktioniert → 422-Fehler → das IST das Demo-Feature, zeigen! |

---

## 5. Demo-Rhetorik

**Wenn etwas schiefgeht**, sage:
> „Das ist genau der Punkt — Reifegradstufe 4 ist ein Agent, kein Orakel. Der Hard-Fail-Validator hat gerade verhindert, dass ein halluziniertes § im Bescheid landet. So sieht Halluzinationsschutz in der Praxis aus."

**Wenn der Agent gut funktioniert**, sage:
> „Beachten Sie: der Agent erfindet keine Förderbereiche, keine Pflichtfelder, keine Paragraphen. Alles kommt aus der kuratierten Datenbasis — `apl.ahp_norm_statements` mit Source-Pinning. Halluzinationen sind hier architektonisch ausgeschlossen."

---

**Letzte Aktualisierung:** 2026-05-25 nach Multi-FB-Cut.
