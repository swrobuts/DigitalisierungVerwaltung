# Roadmap UE0/UE1 nach VL 2026-05-26

**Status:** Konzept festgehalten, noch nicht umgesetzt. Vor VL bewusst NICHT
umgebaut wegen Stabilitätsrisiko.

## Story-Klarstellung

UE0 und UE1 sollen nicht zwei *unterschiedliche Antragsformate* sein, sondern
zwei **Eingänge ins selbe Webformular**. Das ist der saubere Reifegrad-Pfad:

| Stufe | Eingang | Verarbeitung | User-Aktion |
|---|---|---|---|
| UE0 | PDF-Upload (gewohnt) | Claude-Vision-OCR extrahiert Felder, befüllt das gleiche Webformular vor | nur prüfen + absenden |
| UE1 | Direkt das Webformular | Live-Validation während Eingabe | tippen + absenden |
| UE2 | — (Backoffice) | — | Sachbearbeiter:in arbeitet die Inbox ab |
| UE3 | — (Backoffice) | KI prüft, schlägt Bescheid vor | Sachbearbeiter:in entscheidet |
| UE4 | Chat | Agent extrahiert konversationell | Bürger:in bestätigt |

**Konsequenz:** Es gibt EIN Webformular pro FB, geteilt zwischen UE0 und UE1.
UE0 ist ein „dünner Adapter" davor (PDF → Felder → Prefill → Redirect zu UE1).

## Umbau-Schritte (nach VL)

### Schritt 1 — Webformular-Schema fixieren

Pflichtfeld-Inventar pro FB aus den **echten Würzburg-PDFs** ableiten (nicht
erfinden). Quelle: `materialien/wuerzburg-2026/antrag-ahp-{1,2,3}-*.pdf`.
Jedes Feld muss zu einer PDF-Position rückverfolgbar sein.

→ Validierungs-Test: `pytest tests/test_field_inventory.py` läuft durch jeden
FB-Antrag und prüft dass im Webformular keine Felder existieren, die nicht
auch im PDF vorkommen.

### Schritt 2 — UE0 umbauen als „PDF-Adapter zu UE1"

- FB-Wahl bleibt (Bürger weiß FB, lädt direkt zur FB-Upload-Page)
- Smart-Upload bleibt (KI klassifiziert FB)
- Pro FB: 1 PDF-Upload-Slot für den Hauptantrag + 1–2 Slots für Nachweis-Anlagen
- Nach Upload:
  1. n8n liest PDF via Claude Vision aus
  2. Ergebnis landet in `apl.antrag_einreichung.extrahiert_jsonb`
  3. UE0 redirected den Bürger auf `https://antrag.butscher.cloud/antrag/uebernahme/<einreichung_id>`
- UE1 lädt die `extrahiert_jsonb` und prefilled alle Felder
- Bürger kann ergänzen + absenden

**Schlüssel:** UE0 hat KEINE eigenen Webfelder. Es macht NUR PDF → JSON → Redirect.

### Schritt 3 — UE1 echte Mehrwerte einbauen

- **Konditionale Felder** (FB III: Variante-Wahl steuert welche Sub-Felder erscheinen — A: Anmerkung, B: Stadt-Anteil, C: Treffen-Staffel, D: Quartiers-Stunden)
- **Live-Validation** mit klaren Fehlertexten: IBAN-Mod-97, PLZ-5-stellig, Email-Regex, Pflichtfeld-Check
- **DE + TR** für alle FB-spezifischen Felder + Helfer-Inline-Tabelle (FB II)
- **Save-for-later**: Antrags-Zwischenstände in `localStorage` + optional als unauthentifizierter Draft in DB (`apl.antrag_draft`-Tabelle, eigene UUID als Token in URL)
- **Übersicht vor Submit** mit Diff-Highlights („das hat die KI ausgelesen — bitte prüfen")

### Schritt 4 — n8n-Workflow Multi-FB-fähig

Aktueller Stand: alter `apl2`-Workflow ist tot. Konzept in
`ue0/TODO_PHASE_6_N8N.md`. Neue Pipeline:

1. Trigger: INSERT in `apl.antrag_einreichung`
2. Switch auf `erkannter_fb` (oder `klassifiziere_pdf` wenn NULL)
3. Pro FB ein eigener OCR-Branch mit FB-spezifischem Field-Inventory
4. Helferliste (FB II): Sub-Branch ruft `pruefung/api/extrahiere-helferliste`
5. Result → `apl.antrag_einreichung.extrahiert_jsonb` + `status='fertig'`

### Schritt 5 — Demo-PDFs pro FB

Pro FB ein realistisches Demo-PDF in `materialien/wuerzburg-2026/demo-ausgefuellt/`
mit Beispiel-Daten, damit die Pipeline reproduzierbar testbar ist.

## Was NICHT zu tun ist (didaktische Falle)

- **Keine Felder im Webformular erfinden, die im PDF nicht vorkommen.**
  Wenn ein Feld nur online sinnvoll ist (z. B. eine Datenschutz-Checkbox),
  muss es als „nur online"-Feld markiert sein und im OCR-Branch leer bleiben.
- **Kein eigenes UE0-Datenmodell.** UE0 schreibt in `apl.antrag_einreichung`,
  n8n schreibt in `apl.antraege` + Detail-Tabellen, UE1 liest aus den Detail-
  Tabellen. Eine Wahrheit.

## Aufwand-Schätzung

| Schritt | Aufwand |
|---|---|
| 1 Field-Inventory | 2 h |
| 2 UE0-Adapter-Refactor | 3 h |
| 3 UE1 Mehrwerte | 4 h |
| 4 n8n Multi-FB | 3 h |
| 5 Demo-PDFs | 1 h |
| **Total** | **~13 h** |

Pragmatisch über 2 Tage nach der VL verteilt machbar.
