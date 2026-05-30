# 04 — Studi-Aufgaben: UE3 selbst durcharbeiten

> Selbstlern-Modul, 90 Min Basis + 3–5 h Vertiefung.
> UE3 ist die komplexeste Stufe — hier kommen ECHTE KI-Komponenten zum Einsatz.

## Lernziele

Nach diesen Aufgaben kannst du:

1. **Konzeptionell** erklären, warum ein adversarieller Zweitprüfer
   mehr ist als „LLM zweimal aufrufen".
2. **Technisch** den Datenfluss Antrag → Erst-KI → Zweit-KI → Dissens
   → Quellen-Validator → Bescheid-Render nachverfolgen.
3. **Praktisch** eine eigene Norm-Regel in den Doctree einpflegen und
   beobachten, wie die KI sie aufgreift.
4. **Kritisch** beurteilen, wann KI-Empfehlungen sinnvoll sind,
   wann sie gefährlich werden (Automation Bias).
5. **AI-Act-konform** das Compliance-Cockpit lesen und beurteilen,
   welche Pflichten erfüllt sind und welche fehlen.

---

## Teil A — Verständnis (15 Min)

### Quiz 1 — Halluzinations-Schutz

Welche der folgenden Mechanismen schützt UE3 vor halluzinierten
Paragraphen-Zitaten?

- [ ] System-Prompt sagt „Erfinde keine Paragraphen".
- [ ] Output-Schema-Forcing (Claude muss valides JSON liefern).
- [ ] Doctree-basierte Quellen-Validierung gegen
      `apl.norm_statement.ref`.
- [ ] Zweit-KI prüft die Erstprüfung.

<details><summary>Lösung</summary>

- ❌ System-Prompt — hilft, ist aber kein hartes Schutz.
- ❌ Schema-Forcing — nur Format-Garantie, kein Inhalt.
- ✅ **Quellen-Validator** in `quellen_validator.py` — filtert
  Sätze mit nicht-existierenden Refs vor dem Render. Das ist der
  echte Schutz.
- ❌ Zweit-KI — bringt Diversität, aber keine harte Validierung.

</details>

### Quiz 2 — Adoption-Rate

Welche Adoption-Rate (Anteil der KI-Empfehlungen, die unverändert
übernommen werden) ist **das beste Signal**?

- [ ] 100% — KI ist perfekt
- [ ] 0% — Sachbearbeiter:innen entscheiden eigenständig
- [ ] 60–80% — KI hilft, aber Mensch reviewt aktiv
- [ ] Egal — Hauptsache schnelle Bearbeitung

<details><summary>Lösung</summary>

✅ **60–80%** ist ein gutes Band:
- 100% = blindes Übernehmen (Automation Bias!)
- 0% = KI unbrauchbar
- 60–80% = KI hilft, Mensch korrigiert aktiv

Das Compliance-Cockpit zeigt die Adoption-Quote — Aufsicht kann
einschreiten, wenn sie zu hoch oder zu niedrig wird.

</details>

---

## Teil B — Praktischer Durchlauf (30 Min)

### Aufgabe 1 — Einen Demo-Antrag prüfen lassen

1. Login auf <https://ki.butscher.cloud/login>.
2. Inbox: wähle einen Antrag, der noch nicht geprüft wurde
   (z.B. `APL-2026-FBIII-DEMO-C29F50`).
3. Klick „KI-Prüfung starten" — beobachte das progressive Loading
   („verarbeite Antrag …", „validiere Pflichtfelder …", „letzte Polish").
4. Welche Vorschlags-Cards siehst du nach Abschluss?

**Reflexion:** Was sagt dir die Vorschlags-Begründung der Erst-KI?
Wirkt sie schlüssig? Was würde der Mensch jetzt zusätzlich prüfen?

### Aufgabe 2 — Zweit-Prüfung und Dissens

1. Auf dem gleichen Antrag „Zweit-Prüfung starten".
2. Vergleich-Bereich öffnen: was sagt die Zweit-KI?
3. Wenn Dissens vorliegt: welcher Cluster (`konsens`,
   `inhaltlich_unterschiedlich`, `gegensätzlich`)?
4. Lies beide Begründungen — überzeugt dich eine mehr?

**Reflexion:** Ist „Claude vs. Claude" wirklich 4-Augen-Prinzip,
oder nur „Claude mit unterschiedlichen Prompts"? Wo könnte
korrelierter Bias durchschlagen?

### Aufgabe 3 — Externe Validierung

1. Klick „Externe Validierung" (Perplexity-Recherche).
2. Was bekommst du zurück? Welche Quellen werden zitiert?
3. Sind die Aussagen über den Träger plausibel?

**Reflexion:** Wann hilft externe Validierung wirklich, wann ist
sie nur Theater? Wo könnten Quellen-Halluzinationen passieren?

### Aufgabe 4 — Empfehlung übernehmen oder ändern

1. Wähle „Empfehlung übernehmen" → Bescheid-Word-File wird erzeugt.
2. ODER ändere die Empfehlung manuell und gib Begründung ein.
3. Schau im `apl.ki_override`-Eintrag, was protokolliert wurde.

**Reflexion:** Was passiert mit deinem Override im Adoption-Dashboard?
Wenn alle Sachbearbeitenden ein bestimmtes Empfehlungs-Pattern
overrulen — was sollte daraus folgen?

---

## Teil C — Vertiefungs-Aufgaben

### Aufgabe A — Neue Norm-Regel einpflegen ⭐⭐

1. SQL: Neue Zeile in `apl.norm_statement` einfügen:
   ```sql
   INSERT INTO apl.norm_statement (ref, fb, variante, text, aktiv) VALUES
   ('§ 4.2.1', 'III', 'C', 'Seniorenkreis muss min. einen
   verantwortlichen Ehrenamtlichen über 18 Jahre nennen.', true);
   ```
2. Doctree neu indexieren: `pruefung/src/pruefung/doctree_build.py
   --rebuild`
3. Im Frontend einen FB-III-C-Antrag prüfen lassen — taucht die neue
   Regel in der Begründung auf?
4. **Bonus:** Was wäre der DSGVO-konforme Audit-Trail-Eintrag für
   diese Norm-Änderung?

### Aufgabe B — Bescheid-Template tunen ⭐⭐⭐

In `pruefung/src/pruefung/bescheid_subsumtion.py` den Word-Bescheid
um einen Abschnitt „Hinweise für Rechtsbehelf" ergänzen.

1. Jinja-Template-Datei finden, neuen Block einfügen
2. KI-Prompt erweitern, so dass „rechtsbehelf"-Feld immer mitgeliefert wird
3. Test mit Demo-Antrag, Word-File visuell prüfen
4. Halluzinations-Validator: muss der `quellen_validator.py` mit dem
   neuen Feld umgehen?

### Aufgabe C — Adoption-Dashboard interpretieren ⭐

1. Öffne <https://ki.butscher.cloud/compliance> (Tab „Aufsichts-Metriken").
2. Was sind die aktuellen Werte für Adoption-Quote, Dissens-Häufigkeit,
   Bescheid-Renderzeit?
3. Welche Werte würdest du als „gesund" einschätzen, welche als „kritisch"?
4. **Reflexion:** Wie würdest du auf eine Adoption-Quote von 98%
   reagieren? Was sagt dir 20%?

### Aufgabe D — LLM-Provider wechseln ⭐⭐⭐

1. LM Studio lokal installieren (kostenlos)
2. Modell laden: Llama 3.2 oder Mistral
3. In `pruefung/src/pruefung/llm_provider.py` von Anthropic auf LM
   Studio umstellen
4. Eine Prüfung laufen lassen — wie unterscheidet sich die Qualität?
5. **Reflexion:** Welche Datenschutz-Vorteile bringt das lokale LLM?
   Was kostet es an Leistung?

---

## Teil D — Reflexion (20 Min)

Beantworte (500–800 Wörter):

1. **Human-in-the-Loop vs. Automation**: UE3 ist explizit
   „KI schlägt vor, Mensch entscheidet". Wann würdest du diese
   Grenze verschieben — wann nicht? Welche Konsequenzen hätte
   vollautomatische Bescheid-Erstellung (Reifegrad 5)?

2. **Adversarieller Zweitprüfer**: ist „LLM-A vs. LLM-B" wirklich
   4-Augen-Prinzip? Welche Architektur-Verbesserungen würden
   echte Diversität bringen (anderer Hersteller, anderes Training,
   menschlicher Zweitprüfer im Loop)?

3. **Halluzinations-Schutz**: welche Mechanismen hat UE3, und welche
   fehlen noch? Wann ist ein Quellen-Validator ausreichend, wann
   nicht?

4. **AI Act Art. 9, 12, 13, 14, 43, 50**: schau ins
   Compliance-Cockpit-PDF (`rechtskonforme-ki-nutzung.html`). Welche
   Pflichten siehst du dort dokumentiert? Welche fehlen?

5. **Automation Bias**: wenn die Adoption-Quote bei einem Sachbearbeiter
   plötzlich von 70% auf 95% steigt — was könnte das bedeuten? Wie
   würdest du als Aufsicht reagieren?

---

## Bonus — eigene Diagnose

Wenn das Cockpit nicht lädt oder eine KI-Prüfung hängt:

```
1. Login-Diagnose-Card auf /login zeigt 5 Items
2. /compliance: Watchdog auf der VPS hat bei pruefung-service
   evtl. Auto-Restart gemacht — siehe /var/log/supabase-watchdog.log
3. F12 → Network-Tab: filtere nach `pruefung.butscher.cloud`
4. Backend-Log: `ssh root@bot.butscher.cloud "docker logs pruefung-service --tail 30"`
5. Konkrete Anthropic-API-Errors siehst du im Frontend in der KI-Card
```
