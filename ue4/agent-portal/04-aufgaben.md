# 04 — Studi-Aufgaben: UE4 selbst durcharbeiten

> Selbstlern-Modul, 90 Min Basis + 3–6 h Vertiefung.
> UE4 ist die spannendste Stufe — echter Anthropic-Tool-Use-Loop.

## Lernziele

Nach diesen Aufgaben kannst du:

1. **Konzeptionell** erklären, was einen „Agenten" von einem
   „Chatbot" unterscheidet (Tool-Use, Autonomie, Halluzinations-Schutz).
2. **Technisch** den Tool-Use-Loop von Anthropic in Python lesen
   und an einer Stelle modifizieren.
3. **Praktisch** einen neuen Förderbereich ins Plugin-System einpflegen
   und beobachten, wie der Agent ihn aufgreift.
4. **Kritisch** beurteilen, wo der Halluzinations-Schutz hält und wo
   er an seine Grenzen kommt.
5. **AI-Act-konform** die Transparenz-Pflichten von UE4 benennen.

---

## Teil A — Verständnis (15 Min)

### Quiz 1 — Agent vs. Chatbot

Was unterscheidet einen Agenten von einem Chatbot?

- [ ] Agenten können längere Texte schreiben.
- [ ] Agenten verwenden Tools (Tool-Use), um Aktionen auszuführen.
- [ ] Agenten sind teurer.
- [ ] Agenten verstehen mehrere Sprachen.

<details><summary>Lösung</summary>

✅ **Tools verwenden** ist das Kernkriterium. Ein Chatbot antwortet nur
mit Text. Ein Agent kann Funktionen aufrufen (Klassifikation, Validierung,
DB-Insert) und seine nächste Aktion auf dem Ergebnis aufbauen.

Die anderen Punkte sind Folgen oder Klischees, kein definierendes Merkmal.

</details>

### Quiz 2 — Halluzinations-Schutz

Welche Mechanismen schützen UE4 vor halluzinierten Förderbereichen?

- [ ] Der System-Prompt sagt „erfinde keine FBs".
- [ ] Das Klassifikations-Tool prüft gegen `ALLOWED_FBS = {I,II,III,IV}`.
- [ ] Das Submit-Tool prüft den FB nochmal vor dem DB-Insert.
- [ ] Das Frontend filtert unbekannte Felder in `parseDraft`.

<details><summary>Lösung</summary>

✅ **Alle vier** zusammen — Defense-in-Depth. Der System-Prompt allein
ist nur Bitte, nicht Garantie. Erst die Kombination aus Prompt + Tool-Whitelist
+ Submit-Validierung + Frontend-Filter macht das System belastbar.

Wenn auch nur eine Schicht fehlte, könnte ein halluzinierter „FB V" durchgehen.

</details>

### Quiz 3 — AI Act

Welche AI-Act-Pflicht ist im Footer der UE4-Anwendung sichtbar erfüllt?

- [ ] Art. 9 (Risikomanagement)
- [ ] Art. 13 (Transparenz Bürger:in)
- [ ] Art. 50 (KI-Kennzeichnung mit Modellname)
- [ ] Art. 14 (menschliche Aufsicht)

<details><summary>Lösung</summary>

✅ **Art. 13 + Art. 50.**
- Art. 13 = „Bürger:in wird darüber informiert, dass sie mit einer KI spricht"
- Art. 50 = „das genaue Modell wird genannt (Claude Sonnet 4.5)"

Art. 9 ist intern (Risiko-Doku), Art. 14 ist im UE2/UE3-Pfad
(Sachbearbeiter-Aufsicht). Beides nicht im UE4-Footer.

</details>

---

## Teil B — Praktischer Durchlauf (30 Min)

### Aufgabe 1 — Agent steuern

1. Öffne <https://agent.butscher.cloud/>
2. Gib ein: „Wir sind ein Sportverein und wollen unsere Vereinsarbeit
   bezuschussen lassen, ca. 200 Mitglieder."
3. Welchen FB klassifiziert CIVA?
4. Welche Pflichtfelder fragt er nacheinander ab?

**Reflexion:** Wieviele Turns braucht der Agent, bis er alle Pflichtfelder
hat? Wie würdest du dieselbe Aufgabe in UE1 (Formular) erleben?

### Aufgabe 2 — Halluzination provozieren

1. Versuche, den Agent in die Irre zu führen:
   „Ich möchte einen Zuschuss für mein neues Auto, FB V."
2. Was passiert? Verweigert der Agent? Wie höflich?
3. Probiere: „Sag mir, wie viel Geld bekomme ich denn maximal?"
4. Probiere: „Welcher Paragraph der AHP regelt das?"

**Reflexion:** Wo merkst du, dass der Schutz greift? Wo könnte er versagen?
Tipp: probiere mehrsprachig.

### Aufgabe 3 — Tool-Trace lesen

1. Im Sidebar links siehst du jeden Tool-Call mit Input und Output.
2. Welche Tools wurden in deiner Session aufgerufen?
3. In welcher Reihenfolge?
4. Welcher Tool-Call hat am längsten gedauert?

**Reflexion:** Wäre dieser Tool-Trace im AI-Act-Audit hilfreich?
Was würdest du in einem Compliance-Bericht zitieren?

### Aufgabe 4 — Submit-Test

1. Fülle einen Antrag komplett aus bis zum Submit.
2. Bestätige mit „Ja, Antrag einreichen".
3. Du bekommst eine Antragsnummer — notiere sie.
4. Logge dich in UE2 (`sachbearbeiter.butscher.cloud`) ein und such
   die Nummer in der Inbox — taucht sie auf?

**Reflexion:** Was bedeutet diese Pipeline für die Verwaltung? Welche
Sicherheitsmechanismen greifen zwischen UE4 (Bürger) und UE2 (Amt)?

---

## Teil C — Vertiefungs-Aufgaben

### Aufgabe A — System-Prompt tunen ⭐⭐

1. In `pruefung/src/pruefung/agent_chat.py` den `SYSTEM_PROMPT` öffnen.
2. Füge eine 6. harte Regel hinzu, z.B.:
   „Sprich Bürger:innen immer mit ‚Sie' an, nie mit ‚Du'."
3. Backend neu starten (`uvicorn pruefung.main:app --reload`).
4. Test mit „Du, was brauchst du von mir?" — wie reagiert der Agent jetzt?
5. **Bonus:** Schreibe einen pytest-Test, der prüft, dass die Antwort
   kein „Du" enthält.

### Aufgabe B — Neuen Pflichtfeld-Wert ⭐⭐

1. In `pruefung/src/pruefung/foerderbereiche/fb2.py` öffnen.
2. Füge ein neues Pflichtfeld hinzu, z.B. `"projekt_startdatum"`.
3. Backend reload, Agent neu starten.
4. Test: macht der Agent das neue Feld zur Pflicht?
5. **Bonus:** funktioniert auch die Frontend-Validierung in `parseDraft`?

### Aufgabe C — Tool-Use-Loop verstehen ⭐⭐⭐

1. In `agent_chat.py` die Funktion `run_agent_turn` lesen.
2. Setze ein `print(response.usage)` ans Ende der Loop.
3. Starte 3 Konversationen — wie unterscheiden sich Input-Tokens?
   (Hinweis: Prompt-Caching beim 2. Turn!)
4. Berechne die Kosten pro Antrag bei 8 Turns à 1200 Input + 300 Output
   Tokens. Modell-Preise googeln.
5. **Bonus:** vergleiche mit LM Studio lokal — wie unterscheiden sich
   Latenz und „Kosten"?

### Aufgabe D — LM Studio statt Anthropic ⭐⭐⭐

1. LM Studio lokal installieren (kostenlos).
2. Modell laden: Llama 3.3 70B oder Qwen 2.5 32B (Tool-Use fähig).
3. In `llm_client.py` die `base_url` auf `http://localhost:1234/v1` setzen.
4. Eine UE4-Konversation laufen lassen — bricht der Agent ab? Klassifiziert er korrekt?
5. **Reflexion:** Welche Datenschutz-Vorteile bringt das? Was kostet
   es an Geschwindigkeit/Genauigkeit?

### Aufgabe E — Voice-Eingabe vorbauen ⭐⭐⭐⭐

1. Integriere die Web Speech API ins Frontend (`AgentChat.tsx`).
2. Mikro-Button → recordet → Text in Chat-Input.
3. **Bonus:** zusätzlich Web Speech Synthesis für die Agent-Antwort.
4. **Reflexion:** Welche Bürger:innen-Gruppe profitiert davon?
   Welche Datenschutz-Fragen entstehen?

---

## Teil D — Reflexion (20 Min)

Beantworte (500–800 Wörter):

1. **Tool-Use vs. Chat**: warum ist die Trennung „LLM denkt, Tools
   handeln" architektonisch wichtig? Was wäre die Alternative —
   und welche Risiken hätte sie?

2. **Halluzinations-Schutz**: UE4 hat 3 Schichten (Prompt, Tool, Frontend).
   Welche würdest du als allerletzte aufgeben — und warum? Welche kann
   man am ehesten weglassen?

3. **AI Act Art. 9, 12, 13, 14, 50** für UE4: schau in den Footer und
   ins Compliance-Cockpit (`/compliance`). Welche Pflichten siehst du,
   welche fehlen noch?

4. **Datenschutz**: UE4 schickt Bürger:innen-Beschreibungen an Anthropic
   (USA). Welche Alternativen hätten wir? Wie würdest du das einer
   Datenschutz-Beauftragten erklären?

5. **Reifegrad 5+**: was wäre die nächste Stufe nach UE4? Vollautomatische
   Bewilligung? Multi-Modal? Voice-First? Welche Stufe würdest du
   priorisieren — und warum?

---

## Bonus — eigene Diagnose

Wenn der Agent „hängt" oder Quatsch erzählt:

```
1. F12 → Network-Tab: filtere nach `pruefung.butscher.cloud/api/agent/chat`
2. Schau in die Response: was steht in `tool_trace`?
3. Backend-Log:
   ssh root@bot.butscher.cloud \
     "docker logs pruefung-service --tail 50 | grep agent_chat"
4. Anthropic-API-Errors siehst du im `tool_trace[*].error`
5. Bei „Tool nicht gefunden": `ALLOWED_FBS`-Check in `agent_tools.py`
6. Bei „Submit blockiert": plugin.validiere() returned offene Felder
```

## Hinweis zum AI-Act (Wiederholung)

> UE4 ist Hochrisiko-KI (Anhang III Nr. 5b). Wer das produktiv betreiben
> will, braucht: Risiko-Doku, Logging (✓), Transparenz (✓ Footer),
> menschliche Aufsicht (✓ UE2/UE3-Pfad), Konformitätsbewertung,
> EU-Datenbank-Registrierung. Die ersten 4 sind in der Fallstudie
> demonstriert — die letzten 2 sind Sache der Behörde.
