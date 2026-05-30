# 04 — Studi-Aufgaben: UE1 selbst durcharbeiten

> Selbstlern-Modul, 60–90 Min Basis + 2–4 h Vertiefung.

## Lernziele

Nach diesen Aufgaben kannst du:

1. Erklären, warum ein strukturiertes Webformular (auch wenn UE0 schon
   OCR macht) trotzdem einen eigenen Wert hat.
2. Den Multi-Förderbereich-Wizard (FB I–IV mit Varianten A/B/C/D bei FB III)
   in seiner Daten-Logik beschreiben.
3. Die Sticky-Progress-Bar und die Live-Validation als UX-Pattern
   einordnen.
4. Den i18n-Stack (DE/TR komplett, IT/RU/FR mit β-Banner) bewerten —
   was funktioniert, was nicht.
5. Eine Validierungs- oder Übersetzungs-Aufgabe selbst durchziehen.

---

## Teil A — Verständnis (10 Min)

### Quiz 1 — Wo lebt der State des Formulars?

Welche Aussagen sind **richtig**?

- [ ] State liegt im React-Store (Redux/Zustand).
- [ ] State liegt in einem zentralen `formState`-Modul mit
      `subscribe`-Pattern.
- [ ] State liegt nur im DOM (Form-Elemente).
- [ ] State wird bei jeder Eingabe sofort an Supabase persistiert.

<details><summary>Lösung</summary>

- ❌ React-Store — falsch, UE1 ist Vanilla TS, kein React.
- ✅ Zentrales `formState`-Modul mit subscribe — richtig
  (`src/state.ts`).
- ❌ Nur im DOM — falsch, der State ist zwischen den
  Phasen-Wechseln auch sichtbar.
- ❌ Sofort an Supabase — falsch, erst beim finalen Submit
  (Edge Function `submit-antrag`).

</details>

### Quiz 2 — i18n-Fallback

Was passiert, wenn `t("hero.titel")` für die aktuelle Sprache **keinen**
Übersetzungs-Eintrag findet?

- [ ] Es wird ein leerer String zurückgegeben.
- [ ] Es wird der Schlüssel selbst angezeigt (`hero.titel`).
- [ ] Es wird auf DE zurückgefallen.
- [ ] Es wird eine Exception geworfen.

<details><summary>Lösung</summary>

✅ **Fallback auf DE**, sonst Key — siehe `src/lib/i18n.ts`:
`dict[l]?.[key] ?? dict.de?.[key] ?? key`. So bleibt die UI immer
benutzbar, auch wenn die Übersetzung lückenhaft ist (β-Sprachen).

</details>

---

## Teil B — Praktischer Durchlauf (15–30 Min)

### Aufgabe 1 — Antrag starten ohne Prefill

1. Öffne <https://antrag.butscher.cloud/>.
2. Klick „Direkt loslegen" (nicht den UE0-Pfad).
3. Wähle FB III (Bewährte Strukturen) → Variante C (Seniorenkreis).
4. Beobachte: welche Felder werden bei FB III · Variante C abgefragt,
   die bei FB I nicht erscheinen würden?

**Reflexion:** Wie verhindert der Wizard, dass User irrelevante
Felder ausfüllen? Was kostet uns dieser FB-spezifische Aufwand
(in Code-Komplexität)?

### Aufgabe 2 — Prefill aus UE0 nutzen

1. Lade in UE0 ein Demo-PDF hoch.
2. Auto-Redirect zu UE1 mit `?prefill=<uuid>`.
3. Welche Felder sind ausgefüllt? Welche fehlen?
4. Korrigiere ein Feld und sende ab.

**Reflexion:** Was fühlt sich für die Bürger:in als „Mehrwert" an —
das automatische Ausfüllen oder die Möglichkeit zur Korrektur?

### Aufgabe 3 — Mehrsprachigkeit

1. Wechsle in der Sprach-Picker oben rechts auf TR (Türkisch).
2. Klick durch die Steps — welche UI-Elemente bleiben deutsch?
3. Wechsle auf IT (Italienisch) — was siehst du im Header?
4. Wechsle zurück auf DE.

**Reflexion:** Wann hilft eine β-Sprache (Picker sichtbar, aber
Fallback auf DE)? Wann wäre sie sogar irreführend?

---

## Teil C — Vertiefungs-Aufgaben

### Aufgabe A — Validierungs-Regel ergänzen ⭐

In `src/cross-field.ts` eine neue Regel:

> *„Wenn die Personalkosten höher als die Betriebskosten sind, soll
> ein Hinweis erscheinen — das ist ungewöhnlich und sollte begründet
> werden."*

- Tipp: `ValidationErrors` kennt nur Fehler; schreib es als
  „Hinweis: …"-Eintrag.
- **Bonus:** ist diese Regel client-only? Sollte der Server (Edge
  Function `submit-antrag`) sie auch prüfen? Diskutiere die
  Defense-in-Depth-Argumente.

### Aufgabe B — Sprachpaket ergänzen ⭐⭐

Ergänze in `src/lib/i18n.ts` eine fünfte vollständige Sprache (z.B.
Polnisch oder Ukrainisch).

1. `SPRACHEN`-Array erweitern (`fertig: true`)
2. `dict.pl` (oder `dict.uk`) komplett übersetzen — am besten mit
   einem Übersetzer-Tool wie DeepL als Erstentwurf, dann Glossar-
   Konsistenz prüfen
3. Tests (`tests/i18n.test.ts`) müssen weiter grün sein
   (Vollständigkeit der Keys)

**Reflexion:** Wie hoch ist der Aufwand pro Sprache? Wie würdest du
Übersetzungs-Updates organisieren, wenn die DE-Strings sich ändern?

### Aufgabe C — Neues FB-Feld ⭐⭐

Für FB II (Pauschale Förderung Ehrenamt) ein zusätzliches Pflichtfeld
„Hauptansprechpartner für Helferkreis" einführen.

1. `packages/foerderbereiche/fb-ii.ts` erweitern
2. `Phase2FBII.tsx` (oder die entsprechende Vanilla-TS-Komponente)
   um das Eingabefeld ergänzen
3. Übersetzungen in DE+TR pflegen
4. Edge Function akzeptiert das neue Feld
5. UE2/UE3 zeigen das Feld in der Antragsansicht

**Reflexion:** Wie viele Stellen mussten angefasst werden? Wäre der
Refactor anders, wenn das Feld direkt aus dem PDF kommt (UE0
OCR-Pipeline würde es auch lesen)?

### Aufgabe D — Antrag in der DB anschauen ⭐

Loggen Sie sich am Supabase-Studio ein (URL vom Dozenten). Navigieren
Sie zur Tabelle `apl.antraege` und schauen Sie sich Ihren eben
gesendeten Antrag an:

- Welche Antragsnummer hat er bekommen? (`APL-<jahr>-<FB>-<6hex>`)
- Welche IP-Adresse wurde server-side erfasst?
- Welcher User-Agent (Browser)?
- In welcher `submitted_language`?

Dann öffnen Sie den Storage-Bucket `antragsbelege` und finden Sie
Ihre hochgeladenen Belege unter dem Pfad `<antrag-uuid>/<typ>__<filename>`.
Laden Sie eine herunter und prüfen Sie, dass es Ihre Original-Datei ist.

---

## Teil D — Reflexion (15 Min)

Beantworte (300–500 Wörter):

1. **UE1 vs. UE0**: wann ist UE1 (direktes Webformular) besser, wann
   UE0 (PDF-Upload mit OCR)? Wer ist die Zielgruppe der jeweiligen Stufe?

2. **Mehrsprachigkeit**: welches ist die richtige Strategie für ein
   echtes Amt — vollständig in 5 Sprachen, oder DE+EN + Übersetzer-
   Service auf Anfrage? Warum?

3. **Sticky-Progress-Bar**: warum überhaupt? Was ändert sich
   für die Bürger:in, wenn statt einem 5-Step-Wizard ein einziges
   langes Formular präsentiert würde?

4. **Edge Function vs. Direct-Insert**: warum geht der Submit über
   eine Edge Function, statt direkt aus dem Browser in die DB zu
   schreiben (mit RLS-Policy)?

---

## Bonus — eigene Diagnose

Wenn der Submit fehlschlägt, hier die Diagnose-Reihenfolge:

```
1. Browser-Konsole F12 — Fehler beim Submit?
2. Network-Tab → POST /functions/v1/submit-antrag — Status?
3. Edge-Function-Logs in Supabase Studio
4. RLS-Check: anon hat insert auf apl.antraege erlaubt?
5. apl.antrag_history zeigt den Insert-Event?
```
