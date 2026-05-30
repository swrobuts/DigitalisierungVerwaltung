# 04 — Studi-Aufgaben: UE2 selbst durcharbeiten

> Selbstlern-Modul, 60–90 Min Basis + 2–4 h Vertiefung.

## Lernziele

Nach diesen Aufgaben kannst du:

1. Erklären, warum eine Mail-Postfach-Ablage technisch insuffizient
   ist für strukturierte Antragsbearbeitung.
2. Den Unterschied zwischen Frontend-Workflow-Regeln und
   Postgres-Trigger-Defense-in-Depth einordnen.
3. Den Magic-Link-Auth-Flow (anon → authenticated → RLS-Check
   gegen `allow_email`) nachvollziehen.
4. Den Audit-Trail in `apl.antrag_history` lesen und verstehen,
   was er garantiert (und was nicht).
5. Eine eigene Workflow-Statusänderung durchziehen.

---

## Teil A — Verständnis (10 Min)

### Quiz 1 — Wer darf was sehen?

Welche der folgenden Aussagen sind **richtig** für UE2's RLS?

- [ ] Anon-User kann die Inbox lesen.
- [ ] Eingeloggte User sehen alle Anträge.
- [ ] Die Allowlist `apl.allow_email` entscheidet, wer überhaupt einloggen kann.
- [ ] Status-Übergänge werden nur im Frontend validiert.

<details><summary>Lösung</summary>

- ❌ Anon-User: nicht für die Inbox — RLS lässt anon nur die `submit-antrag`-Funktion.
- ✅ Eingeloggte User sehen alle Anträge (es gibt aktuell kein Mandanten-Splitting).
- ✅ Die Allowlist entscheidet, dass nur freigeschaltete E-Mails einloggen.
- ❌ Falsch — auch der **Postgres-Trigger** prüft Status-Übergänge
  (Defense-in-Depth).

</details>

### Quiz 2 — Audit-Trail

Was steht in einer typischen `apl.antrag_history`-Zeile?

- [ ] Wer (E-Mail des Sachbearbeiters)
- [ ] Wann (Timestamp)
- [ ] Was (alter Status → neuer Status)
- [ ] Warum (optionaler Kommentar)
- [ ] Inhalt der Felder-Änderungen
- [ ] Verschlüsselte Bürger-Daten

<details><summary>Lösung</summary>

✅ Wer · Wann · Was · Warum (4 von 6 Einträgen sind richtig).
Felder-Änderungen werden separat in `apl.antraege` versioniert,
nicht im History-Log. Bürger-Daten unverschlüsselt (DSGVO durch RLS, nicht Verschlüsselung).

</details>

---

## Teil B — Praktischer Durchlauf (15–30 Min)

### Aufgabe 1 — Inbox erkunden

1. Öffne <https://sachbearbeiter.butscher.cloud/login>.
2. Magic-Link mit der freigeschalteten E-Mail anfordern + klicken.
3. Inbox laden — wie viele Anträge siehst du? Was sagt der FB-Filter?
4. Klick auf einen Antrag.

**Reflexion:** Wie unterscheidet sich diese Sicht von einem
Mail-Postfach? Was kann man hier, was man dort nicht kann?

### Aufgabe 2 — Status ändern

1. Im Antrags-Detail einen Status-Übergang machen (z.B.
   „Eingegangen" → „in Prüfung").
2. Optional einen Kommentar eingeben.
3. Speichern.
4. Realtime: öffne in einem zweiten Tab die Inbox-Liste — siehst du
   den Status-Wechsel ohne Reload?
5. Check den History-Tab im Antrags-Detail — was steht dort?

**Reflexion:** Was würde passieren, wenn jemand mit DevTools den
Status-Wert auf einen ungültigen Übergang manipuliert? (Hinweis:
ausprobieren — der Postgres-Trigger lehnt ab!)

### Aufgabe 3 — Anlagen herunterladen

1. Im Antrags-Detail die Anlagen-Liste anschauen.
2. Klick auf eine Anlage → Download.
3. Was passiert technisch? Welche URL siehst du?

**Reflexion:** Warum werden Anlagen-Downloads über
**signed URLs** statt direkter Storage-Links ausgeliefert?

---

## Teil C — Vertiefungs-Aufgaben

### Aufgabe A — Status-Filter in der Inbox ⭐

In `src/pages/Inbox.tsx` einen Status-Filter ergänzen:

> Pill-Buttons oben („Alle", „Eingegangen", „in Prüfung", "Bewilligt", "Abgelehnt") — bei Klick filtert die Tabelle.

- Verwende den vorhandenen `FbFilterPill`-Komponenten-Style
- Tests: bestehende `InboxTable`-Tests dürfen nicht brechen

### Aufgabe B — Neues History-Event-Type ⭐⭐

Einen neuen Event-Typ „Anlage hinzugefügt" einführen:

1. `apl.antrag_history.event_type` Enum erweitern
   (Migration!)
2. Trigger auf `apl.anlagen` Insert → History-Eintrag
3. Frontend: History-Timeline rendert auch diesen Event-Typ
4. Tests pro Schicht

### Aufgabe C — Eingangsbestätigungs-Mail tunen ⭐⭐

In `supabase/webhooks/n8n-apl2-eingangsbestaetigung.json`:

1. Eine fünfte Sprache (Polnisch) zum Switch-Node hinzufügen
2. Mail-Template auf Polnisch formulieren
3. Im n8n-UI testen (manueller Webhook-Trigger mit `sprache=pl`)
4. Diskussion: wie würde ein professionelles Übersetzungs-Pipeline
   aussehen, statt Templates hardgecoded im n8n?

### Aufgabe D — Sachbearbeiter-Allowlist ⭐

Einen neuen User freischalten:

```sql
INSERT INTO apl.allow_email (email, rolle)
VALUES ('neue.kollegin@thws.de', 'sachbearbeiter');
```

- Diese Kollegin kann sich jetzt einloggen
- Aber: wo sieht man die Liste der freigeschalteten User?
  (Antwort: nur direkt in der DB — UI dafür fehlt — Diskussion: sollte das eine UI geben?)
- Was wäre der nächste sinnvolle Schritt für Multi-Mandanten-Setup?

---

## Teil D — Reflexion (15 Min)

Beantworte (300–500 Wörter):

1. **Workflow-Engine vs. „Excel-Liste"**: was gewinnt das Amt ganz
   konkret, wenn die erlaubten Status-Übergänge in der DB statt im
   Kopf der Sachbearbeiter:in liegen?

2. **Realtime in der Inbox**: warum überhaupt? Wann hilft das den
   Sachbearbeiter:innen, wann ist es egal?

3. **RLS auf Datenbank-Ebene**: wo ist diese Stufe stärker als
   „eine Mailbox mit Passwort"? Welche Angriffsszenarien werden
   abgedeckt, welche bleiben offen?

4. **Audit-Trail in `antrag_history`**: was kann man damit
   nachweisen? Was nicht? (Hinweis: Eingriffe direkt mit der
   service-role bypassen die Trigger.)

---

## Bonus — eigene Diagnose

Wenn der Login fehlschlägt, hier die Diagnose-Reihenfolge:

```
1. Login-Diagnose-Card oben auf der /login-Seite — alle 5 Items ✓?
2. Callback-Seite nach Magic-Link-Klick — bleibt sie stehen
   oder springt sie zurück auf /login?
3. F12 → Network-Tab → Suche nach `allow_email` und `auth/v1/otp`
4. allow_email-Eintrag mit deiner E-Mail in der DB vorhanden?
5. Browser-Inkognito vermeidet alle CORS-Cache-Probleme
```

(Wir haben diese Diagnose am 2026-05-30 nach 5 Stunden Hin-und-Her
gebaut — die Card oben auf /login zeigt sofort, was klemmt.)
