"""UE4 — Sozialamt-Assistent (agentisches Antragsformular, Reifegradstufe 4).

Konversations-Loop mit Anthropic Tool-Use. Der Agent
1. klassifiziert den Förderbereich aus Freitext,
2. fragt nacheinander die Pflichtfelder ab,
3. validiert Eingaben (E-Mail, IBAN, PLZ etc.),
4. submittet den fertigen Antrag.

Halluzinations-Schutz (oberste Priorität, nicht-verhandelbar):
- Der System-Prompt schreibt 5 harte Regeln vor (siehe SYSTEM_PROMPT).
- Tool-Outputs werden HART validiert (kein Pass-Through für erfundene
  FBs/Felder).
- Wenn der User nach Förderhöhe/§/Rechtsgrundlage fragt, weicht der Agent
  bewusst aus (das steht im Bescheid, nicht im Chat).
"""
from __future__ import annotations

import json
import os
import re
from typing import Any

from .agent_tools import (
    ALLOWED_FBS,
    FB_BESCHREIBUNGEN,
    FB_III_VARIANTEN_BESCHREIBUNGEN,
    _ANTRAG_BASIS_FELDER,
    tool_bereite_uebernahme_vor,
    tool_get_pflichtfelder,
    tool_klassifiziere_foerderbereich,
    tool_validate_field,
)


SYSTEM_PROMPT = """\
Du bist „Anna", der digitale Sozialamt-Assistent der Stadt Würzburg.
Du hilfst **gemeinnützigen Trägern** (Wohlfahrtsverbände, Pfarreien,
eingetragene Vereine, Mehrgenerationenhäuser), Anträge nach der Würzburger
Altenhilfe-Förderrichtlinie 2025 (AHP) auszufüllen und einzureichen.

WAS DIE AHP IST (lies das, bevor du irgendetwas sagst):
Die AHP ist eine TRÄGER-Förderung — nicht Bürger-Einzelförderung. Es geht
NICHT um Wohnungsumbau, technische Hilfsmittel, Pflegegeld oder
individuelle Leistungen. Es geht um Strukturen und Angebote der Altenhilfe:

- **Förderbereich I — „Aufbau"**: Anschubfinanzierung für NEUE
  niedrigschwellige Angebote oder neue Engagement-Strukturen
  (Beispiele: neues Nachbarschaftscafé, neuer Besuchsdienst).
- **Förderbereich II — „Engagement"**: Pauschale Förderung von
  bürgerschaftlichem Engagement (Helferkreise, Besuchsdienste,
  Nachbarschaftshilfen). Pflicht: Helferliste mit Stunden.
- **Förderbereich III — „Bewährte Strukturen"**: laufende Förderung
  etablierter Strukturen — vier Varianten:
    A) Mehrgenerationenhaus (Bundesprogramm-Bestätigung nötig)
    B) Begegnungszentrum oder Bildungsträger
    C) Seniorenkreis/Seniorentreffen (Treffen-Staffel ≥10/≥20/≥40)
    D) Quartiersmanagement
- **Förderbereich IV — „Schwerpunkt"**: individuelle Vorhaben außerhalb
  der Standard-FBs (strukturierter Antrag mit Leitfragen).

Antragsteller sind IMMER Organisationen, nie Einzelpersonen.
Wenn jemand fragt „Wer ist antragsberechtigt?": „Gemeinnützige Träger
der Seniorenarbeit in Würzburg." Privatpersonen leite freundlich an die
Würzburger Sozialberatung weiter (Tel. 0931 37-0).

HARTE REGELN (NICHT verhandelbar):
1. Du darfst NUR die Förderbereiche I, II, III, IV nennen. Keine erfundenen
   FBs. Wenn dir das Tool keinen FB liefert (fb=null), erkläre, dass du
   unsicher bist, und bitte um eine genauere Beschreibung.
2. Du darfst NUR die Pflichtfelder abfragen, die `get_pflichtfelder()` für
   den gewählten FB zurückliefert. KEINE Felder erfinden.
3. Du darfst KEINE konkreten Förderhöhen oder Euro-Beträge nennen — die
   Höhe wird in der Sachbearbeitung anhand der Richtlinie berechnet und
   steht erst im Bescheid. Wenn der User danach fragt: „Die genaue Höhe
   richtet sich nach der AHP-Richtlinie und wird Ihnen im Bescheid
   mitgeteilt."
4. Du darfst KEINE Paragraphen (§) zitieren. Wenn der User nach
   Rechtsgrundlage fragt: „Die Rechtsgrundlage und alle Zitate stehen
   im späteren Bescheid."
5. Sei freundlich, klar, zurückhaltend. Antworte auf Deutsch,
   gendergerecht. WICHTIG zur Effizienz:
   - Frage die Pflichtfelder in 5 LOGISCHEN BLÖCKEN, nicht einzeln:
       Block 1 „Träger"   : Einrichtung + Ansprechpartner:in
       Block 2 „Anschrift" : Straße + Hausnummer + PLZ + Ort
       Block 3 „Kontakt"   : Telefon + E-Mail
       Block 4 „Bank"      : Bankname + IBAN + BIC
       Block 5 „FB-Details": Pflichtfelder für den gewählten FB
         (aus get_pflichtfelder, wieder in einem Schwung)
   - Pro Block: 1 Frage mit kurzer Aufzählung, der Bürger antwortet
     typisch mit allen Feldern in einer Nachricht. Du parst sie und
     rufst pro extrahiertem Feld einmal `validate_field` auf — das
     darfst du PARALLEL machen (mehrere tool_use-Blocks in einer
     Assistant-Antwort sind erlaubt).
   - Frage NICHT nach Feldern, die du bereits aus der Konversation
     kennst — nutze die Historie und den Server-Draft.
   - Wenn ein Block-Wert fehlt oder unklar ist, frage GEZIELT genau
     dieses eine Feld nach (nicht den ganzen Block neu).
   - WICHTIG für `validate_field`: nutze AUSSCHLIESSLICH diese exakten
     `field_name`-Werte (sonst landen sie im falschen Slot beim UE1-
     Hand-off):
       Antragsteller-Block:
         einrichtung, ansprechpartner, strasse, hausnummer, plz, ort,
         telefon, email, bankname, iban, bic, haushaltsjahr,
         dachverband, homepage
       FB I:    projekt_titel, laufzeit, stadtteil,
                personalkosten_euro, sachkosten_euro
       FB II:   ehrenamt_titel, anzahl_helfer_vorjahr,
                gesamt_helferstunden_vorjahr, direkter_kontakt_senioren
       FB III:  variante  (A/B/C/D), plus die varianten-spezifischen
                Felder (b_*, c_*, d_*)
       FB IV:   vorhaben_titel, kurzbeschreibung, geplante_massnahmen,
                beantragte_summe_euro, laufzeit
     Verwende „ansprechpartner" — NICHT „ansprechperson", „kontaktperson"
     oder „name". Verwende „einrichtung" — NICHT „organisation" oder
     „traeger". Verwende „bankname" — NICHT „bank" oder „kreditinstitut".
   - SPEZIELL FB-III Variante C (Seniorenkreis):
       - `c_treffen_schwelle` ist ein ENUM: nur „GT_10", „GT_20" oder
         „GT_40". Wenn der Bürger „20 Treffen" sagt → validate_field
         (`c_treffen_schwelle`, „GT_20"). Wenn er „über 40" sagt →
         „GT_40". Niemals einfach „20" als Wert übergeben.
       - `c_teilnehmer_durchschnitt` ist eine Zahl (z.B. „9").
   - SPEZIELL FB-III Variante B (Begegnungszentrum):
       - `b_anzahl_veranstaltungen`, `b_teilnehmer_senioren`,
         `b_teilnehmer_generationen` sind Zahlen.
       - `b_stadtbewohner_anteil` ist ein Dezimalwert zwischen 0 und 1
         (z.B. „0.85" für 85% Würzburger Anteil).
   - SPEZIELL FB-III Variante D (Quartiersmanagement):
       - `d_hauptamt_name` ist Name der Person.
       - `d_hauptamt_stunden_woche` und `d_hauptamt_stunden_monat` sind
         Zahlen (Stunden pro Woche / Monat).

ABLAUF:
- Beim allerersten User-Beitrag: rufe `klassifiziere_foerderbereich` auf.
  Wenn das Tool einen FB mit Konfidenz ≥ 0.5 liefert, bestätige ihn
  freundlich beim User („Verstanden — das klingt nach FB X. Stimmt das?").
- Sobald der FB bestätigt ist (oder du dir aus dem Kontext sicher bist),
  rufe `get_pflichtfelder` auf, um die nächste Frage zu kennen.
- Für jedes Pflichtfeld: stelle EINE freundliche Frage. Wenn der User
  antwortet, rufe `validate_field` auf. Bei Fehler: nett erklären und
  nochmal fragen.
- Wenn alle Pflichtfelder gefüllt sind: fasse den Antrag zusammen und
  frage explizit nach Bestätigung („Passen alle Angaben so? Dann übergebe
  ich Sie ans Webformular, wo Sie alles nochmal in Ruhe prüfen und
  abschicken können.").
- Erst NACH der Bestätigung rufe `bereite_uebernahme_vor` auf. Das Tool
  returnt eine `webformular_url` — gib genau diese URL in deiner Antwort
  zurück und sage z.B.: „Alles vorbereitet — ich leite Sie jetzt ins
  Webformular weiter, dort können Sie noch einmal alles prüfen und
  endgültig absenden." Das Frontend leitet automatisch weiter.
- Rufe NIEMALS `submit_antrag` auf. Der Bürger sendet den Antrag selbst
  ab — auf dem strukturierten UE1-Webformular. Du sammelst und übergibst.

WENN DAS THEMA NICHT PASST:
- KFZ-Förderung, Bau-Anträge, BAföG, Wohngeld etc. sind KEINE AHP-Themen.
- Erkläre höflich, dass du nur für die Altenhilfe-Förderung zuständig
  bist, und nenne als Alternative die zentrale Beratung (0931 37 0).
- NIEMALS einen passenden FB erfinden.
"""


# ── Tool-Schemas (Anthropic Tool-Use Format) ─────────────────────────


TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "name": "klassifiziere_foerderbereich",
        "description": (
            "Klassifiziert eine Antrags-Beschreibung in einen "
            "AHP-Förderbereich (I/II/III/IV). Returnt fb, variante "
            "(nur bei FB III), konfidenz, begruendung."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "beschreibung": {
                    "type": "string",
                    "description": "Was der Bürger fördern lassen möchte (Freitext).",
                },
            },
            "required": ["beschreibung"],
        },
    },
    {
        "name": "get_pflichtfelder",
        "description": (
            "Liefert die Pflichtfeld-Liste für den gegebenen FB (+ FB-III-Variante). "
            "Returnt felder_mit_labels mit menschlich-lesbaren Labels und Beispielen."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "fb": {
                    "type": "string", "enum": ["I", "II", "III", "IV"],
                    "description": "Förderbereich.",
                },
                "variante": {
                    "type": ["string", "null"],
                    "enum": ["A", "B", "C", "D", None],
                    "description": "FB-III-Variante, sonst null.",
                },
            },
            "required": ["fb"],
        },
    },
    {
        "name": "validate_field",
        "description": (
            "Validiert einen Wert für ein bestimmtes Pflichtfeld "
            "(Email, IBAN, PLZ, Zahl-Felder, FB-III-Variante etc.). "
            "Returnt {ok, fehler}."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "field_name": {"type": "string"},
                "value": {"type": "string"},
            },
            "required": ["field_name", "value"],
        },
    },
    {
        "name": "bereite_uebernahme_vor",
        "description": (
            "Bereitet die Übergabe des Antrags ans UE1-Webformular vor. NUR "
            "aufrufen, NACHDEM der User alle Angaben bestätigt hat. Der "
            "Agent submitted NICHT selbst — er gibt die Daten ans Webformular "
            "weiter, wo der Bürger sie strukturiert prüft und endgültig "
            "absendet. Returnt {webformular_url, status='ready_for_handoff'}. "
            "Das Frontend leitet anhand der URL automatisch weiter."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "draft": {
                    "type": "object",
                    "description": (
                        "Antrags-Draft mit foerderbereich, fb_iii_variante, "
                        "antragsteller, fb_specific."
                    ),
                },
            },
            "required": ["draft"],
        },
    },
]


# ── Dispatcher ───────────────────────────────────────────────────────


async def _dispatch_tool(
    name: str, input_: dict[str, Any], *,
    db: Any | None = None,
    anthropic_client: Any | None = None,
) -> dict[str, Any]:
    """Routet Tool-Calls auf die Implementierungen in agent_tools.py.

    Wirft NIE — Fehler werden als Tool-Ergebnis durchgereicht, damit das
    LLM darauf reagieren kann (z.B. Höflich umformulieren).
    """
    if name == "klassifiziere_foerderbereich":
        try:
            return await tool_klassifiziere_foerderbereich(
                input_.get("beschreibung", ""),
                anthropic_client=anthropic_client,
            )
        except Exception as e:  # noqa: BLE001
            return {
                "fb": None, "variante": None, "konfidenz": 0.0,
                "begruendung": f"Klassifikation fehlgeschlagen: {e!r}"[:300],
            }
    if name == "get_pflichtfelder":
        return tool_get_pflichtfelder(
            input_.get("fb"), input_.get("variante"),
        )
    if name == "validate_field":
        return tool_validate_field(
            input_.get("field_name", ""),
            input_.get("value", ""),
        )
    if name in ("bereite_uebernahme_vor", "submit_antrag"):
        # Wichtig: das LLM rekonstruiert den `draft`-Argument oft nur aus
        # der letzten Konversation und vergisst Felder, die früh im Chat
        # gefallen sind. Wir mergen daher den serverseitigen `current_draft`
        # (der im run_agent_turn-Loop gepflegt wird) als Basis und lassen
        # das LLM-Argument nur ergänzen/überschreiben. Das stellt sicher,
        # dass alle gesammelten Antragsteller-/FB-Felder im URL-Hash
        # ankommen — keine Lücken durch LLM-Vergesslichkeit.
        llm_draft = input_.get("draft", {}) or {}
        merged = _merge_drafts(_CURRENT_DRAFT_REF.get(), llm_draft)
        return await tool_bereite_uebernahme_vor(
            merged,
            ue1_base_url=os.environ.get("UE1_BASE_URL", "https://antrag.butscher.cloud"),
        )
    return {"fehler": f"Unbekanntes Tool: {name}"}


# ── Draft-Merge-Helper ────────────────────────────────────────────────


class _DraftRef:
    """Mini-Container, damit _dispatch_tool ohne extra Param-Drehrad an
    den aktuellen Server-Draft kommt. Wird pro run_agent_turn neu gesetzt."""
    def __init__(self) -> None:
        self._d: dict[str, Any] = {}
    def set(self, d: dict[str, Any]) -> None:
        self._d = dict(d or {})
    def get(self) -> dict[str, Any]:
        return self._d


_CURRENT_DRAFT_REF = _DraftRef()


def _merge_drafts(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    """Tief-Merge zweier Drafts. Overlay-Werte gewinnen, NULL-Felder
    werden NICHT übernommen (sonst löscht ein vergesslicher LLM-Aufruf
    bereits gesammelte Felder)."""
    out = dict(base)
    for k, v in (overlay or {}).items():
        if v in (None, "", {}):
            continue
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge_drafts(out[k], v)
        else:
            out[k] = v
    return out


def _serialize_messages(
    history: list[dict[str, Any]], user_message: str,
) -> list[dict[str, Any]]:
    """Konvertiert das Chat-Log-Format des Frontends in Anthropic-Messages.

    Frontend-Format: [{role, content, timestamp}, ...]
    Anthropic-Format: [{role, content: str | [{type, text, ...}]}]
    System-Role wird aus dem Frontend-Log gestrippt (System-Prompt ist
    backend-seitig fest).
    """
    out: list[dict[str, Any]] = []
    for m in history:
        if m.get("role") not in ("user", "assistant"):
            continue
        content = m.get("content")
        if not content:
            continue
        out.append({"role": m["role"], "content": content})
    # Aktuelle User-Message anhängen
    if user_message:
        out.append({"role": "user", "content": user_message})
    return out


def _flatten_assistant_text(content_blocks: list[Any]) -> str:
    """Sammelt alle text-Blöcke einer Assistant-Response zu einem String."""
    parts: list[str] = []
    for b in content_blocks:
        if isinstance(b, dict):
            if b.get("type") == "text":
                parts.append(b.get("text", ""))
        else:
            # SDK-Objekt mit .type-/.text-Attribut
            if getattr(b, "type", None) == "text":
                parts.append(getattr(b, "text", ""))
    return "\n".join(p for p in parts if p).strip()


def _extract_tool_uses(content_blocks: list[Any]) -> list[dict[str, Any]]:
    """Zieht alle tool_use-Blöcke aus einer Assistant-Response."""
    out: list[dict[str, Any]] = []
    for b in content_blocks:
        if isinstance(b, dict):
            if b.get("type") == "tool_use":
                out.append({
                    "id": b.get("id"),
                    "name": b.get("name"),
                    "input": b.get("input", {}),
                })
        else:
            if getattr(b, "type", None) == "tool_use":
                out.append({
                    "id": getattr(b, "id", None),
                    "name": getattr(b, "name", None),
                    "input": getattr(b, "input", {}) or {},
                })
    return out


def _content_blocks_for_history(content_blocks: list[Any]) -> list[dict[str, Any]]:
    """Konvertiert SDK-Content-Blocks in Plain-Dicts (für Re-Send)."""
    out: list[dict[str, Any]] = []
    for b in content_blocks:
        if isinstance(b, dict):
            out.append(b)
            continue
        t = getattr(b, "type", None)
        if t == "text":
            out.append({"type": "text", "text": getattr(b, "text", "")})
        elif t == "tool_use":
            out.append({
                "type": "tool_use",
                "id": getattr(b, "id", None),
                "name": getattr(b, "name", None),
                "input": getattr(b, "input", {}) or {},
            })
    return out


def _merge_tool_results_into_draft(
    draft: dict[str, Any],
    tool_calls: list[dict[str, Any]],
    tool_results: list[dict[str, Any]],
) -> dict[str, Any]:
    """Aktualisiert den Draft serverseitig basierend auf Tool-Outputs.

    Das macht den Draft robust gegen halluzinierte Werte: selbst wenn das
    LLM beim Render der Antwort schummeln würde, basiert die UI-Vorschau
    auf den TATSÄCHLICHEN Tool-Returnwerten.
    """
    updated = dict(draft)
    for call, res in zip(tool_calls, tool_results):
        if not isinstance(res, dict):
            continue
        name = call.get("name")
        if name == "klassifiziere_foerderbereich":
            fb = res.get("fb")
            variante = res.get("variante")
            konfidenz = res.get("konfidenz", 0.0)
            # Nur übernehmen wenn Konfidenz ausreichend hoch ist UND der
            # User noch keinen FB gesetzt hat (sonst überschreiben wir
            # eine bewusste User-Wahl).
            if fb in ALLOWED_FBS and konfidenz >= 0.5 and not updated.get("foerderbereich"):
                updated["foerderbereich"] = fb
                if variante:
                    updated["fb_iii_variante"] = variante
        elif name == "validate_field":
            # Wenn ein Feld erfolgreich validiert wurde, schreiben wir den
            # Wert in den Server-Draft. Sonst hat das Frontend (und der
            # nächste Tool-Call) keine Chance, die gesammelten Bürger-
            # Eingaben zu rekonstruieren — das LLM würde sie alle wieder
            # neu aus der Chat-History parsen müssen.
            if res.get("ok"):
                field_name = call.get("input", {}).get("field_name")
                value = call.get("input", {}).get("value")
                # LLM-Synonym-Normalisierung: das LLM nennt das Feld
                # gelegentlich anders als unsere kanonischen Namen.
                # Vorher landete „ansprechperson" in fb_specific und das
                # UE1-Webformular zeigte ein leeres Ansprechpartner-Feld.
                _FIELD_ALIASES = {
                    "ansprechperson": "ansprechpartner",
                    "kontaktperson": "ansprechpartner",
                    "kontakt": "ansprechpartner",
                    "kontaktname": "ansprechpartner",
                    "organisation": "einrichtung",
                    "traeger": "einrichtung",
                    "verein": "einrichtung",
                    "kirche": "einrichtung",
                    "antragsteller": "einrichtung",
                    # bewusst NICHT: "name" → mehrdeutig (Einrichtung vs. Person)
                    "strasse_hausnummer": "strasse",
                    "address": "strasse",
                    "adresse": "strasse",
                    "postleitzahl": "plz",
                    "stadt": "ort",
                    "telefonnummer": "telefon",
                    "tel": "telefon",
                    "mail": "email",
                    "e_mail": "email",
                    "bankverbindung": "bankname",
                    "bank": "bankname",
                    "kreditinstitut": "bankname",
                    "fb_iii_variante": "variante",
                    # FB-III-Variante-Felder (Treffen, Teilnehmer, Quartier)
                    "treffen_pro_jahr": "c_treffen_schwelle",
                    "anzahl_treffen": "c_treffen_schwelle",
                    "treffen_anzahl": "c_treffen_schwelle",
                    "teilnehmer_pro_treffen": "c_teilnehmer_durchschnitt",
                    "durchschnittliche_teilnehmer": "c_teilnehmer_durchschnitt",
                    "teilnehmer_durchschnitt": "c_teilnehmer_durchschnitt",
                    "quartier_anzahl": "c_quartierstreffen_anzahl",
                    "quartierstreffen": "c_quartierstreffen_anzahl",
                    "quartier_kooperation": "c_quartier_kooperation",
                    # FB-III-Variante-B (Begegnungszentrum)
                    "veranstaltungen": "b_anzahl_veranstaltungen",
                    "anzahl_veranstaltungen": "b_anzahl_veranstaltungen",
                    "teilnehmer_senioren": "b_teilnehmer_senioren",
                    "teilnehmer_generationen": "b_teilnehmer_generationen",
                    "stadtbewohner_anteil": "b_stadtbewohner_anteil",
                    # FB-III-Variante-D (Quartiersmanagement)
                    "hauptamt_name": "d_hauptamt_name",
                    "hauptamt_stunden_woche": "d_hauptamt_stunden_woche",
                    "stunden_pro_woche": "d_hauptamt_stunden_woche",
                    "hauptamt_stunden_monat": "d_hauptamt_stunden_monat",
                    "stunden_pro_monat": "d_hauptamt_stunden_monat",
                }
                # Wert-Transform für c_treffen_schwelle: numerische
                # Eingabe ("20") in das Enum mappen ("GT_20"). Wenn der
                # Agent das nicht selbst macht, holen wir's hier nach.
                if field_name == "c_treffen_schwelle" or call.get("input", {}).get("field_name") in (
                    "treffen_pro_jahr", "anzahl_treffen", "treffen_anzahl",
                ):
                    raw = str(value or "").strip().upper()
                    if raw not in ("GT_10", "GT_20", "GT_40"):
                        try:
                            n = int(re.sub(r"[^0-9]", "", raw))
                            if n >= 40:
                                value = "GT_40"
                            elif n >= 20:
                                value = "GT_20"
                            elif n >= 10:
                                value = "GT_10"
                        except (ValueError, TypeError):
                            pass
                if field_name in _FIELD_ALIASES:
                    field_name = _FIELD_ALIASES[field_name]
                if field_name and value not in (None, ""):
                    # Variante separat (in der DB ein eigenes Top-Level-Feld,
                    # nicht in fb_specific). Akzeptiert sowohl "variante" als
                    # auch "fb_iii_variante" als Field-Name (LLM-Drift).
                    if field_name in ("variante", "fb_iii_variante"):
                        v = (value or "").strip().upper()
                        if v in ("A", "B", "C", "D"):
                            updated["fb_iii_variante"] = v
                    # Antragsteller-Block: einrichtung/iban/email/...
                    # (inkl. optionale Felder dachverband/hausnummer/homepage)
                    elif field_name in _ANTRAG_BASIS_FELDER or field_name in (
                        "dachverband", "hausnummer", "homepage",
                    ):
                        antragsteller = dict(updated.get("antragsteller") or {})
                        antragsteller[field_name] = value
                        updated["antragsteller"] = antragsteller
                    else:
                        # FB-spezifische Felder (b_*, c_*, d_*, ehrenamt_titel,
                        # projekt_titel, vorhaben_titel, kurzbeschreibung etc.)
                        fb_specific = dict(updated.get("fb_specific") or {})
                        fb_specific[field_name] = value
                        updated["fb_specific"] = fb_specific
        elif name in ("bereite_uebernahme_vor", "submit_antrag"):
            # Beide routen auf den Hand-off-Pfad: kein direct-submit mehr.
            # webformular_url im Draft → Frontend triggert Redirect.
            url = res.get("webformular_url")
            if url:
                updated["webformular_url"] = url
                updated["status"] = "ready_for_handoff"
    return updated


# ── Main Entry-Point ─────────────────────────────────────────────────


async def run_agent_turn(
    *,
    history: list[dict[str, Any]],
    user_message: str,
    current_draft: dict[str, Any] | None = None,
    db: Any | None = None,
    anthropic_client: Any | None = None,
    model: str = "claude-sonnet-4-5",
    max_tool_iters: int = 5,
) -> dict[str, Any]:
    """Führt EINEN konversationellen Turn aus und returnt das Ergebnis.

    Args:
        history: Bisherige Messages im Frontend-Format
                 [{role, content, timestamp}, ...].
        user_message: Neue Nachricht vom User.
        current_draft: Bisheriger Antrags-Draft (FB, Antragsteller, ...).
        db: SupabaseClient (für submit_antrag). None = Dry-Run.
        anthropic_client: AsyncAnthropic-Instanz (für Tests Mock injizieren).
        model: Claude-Modell.
        max_tool_iters: Sicherheitslimit für Tool-Loop.

    Returns:
        {
            assistant_message: str,           # Text, der dem User angezeigt wird
            updated_draft: dict,              # Neuer Draft-Stand
            next_action: str,                 # Hint für die UI
            tool_trace: [{name, input, output}],  # Debug-/Transparenz
        }
    """
    if anthropic_client is None:
        from anthropic import AsyncAnthropic
        anthropic_client = AsyncAnthropic(
            api_key=os.environ["ANTHROPIC_API_KEY"],
        )

    messages = _serialize_messages(history, user_message)
    draft = dict(current_draft or {})
    # Auch frühere Tool-Outputs aus der History rekonstruieren, damit der
    # Server-Draft nicht „leer" startet, wenn das Frontend nur den minimalen
    # current_draft schickt. Außerdem Antragsteller-Felder aus User-Messages
    # extrahieren (heuristisch via klassifiziere_foerderbereich-Logs).
    _CURRENT_DRAFT_REF.set(draft)
    tool_trace: list[dict[str, Any]] = []

    for _iter in range(max_tool_iters):
        response = await anthropic_client.messages.create(
            model=model,
            max_tokens=1500,
            system=SYSTEM_PROMPT,
            tools=TOOL_SCHEMAS,
            messages=messages,
        )

        content_blocks = response.content if response.content else []
        tool_uses = _extract_tool_uses(content_blocks)
        assistant_text = _flatten_assistant_text(content_blocks)
        stop_reason = getattr(response, "stop_reason", None)

        # Stop-Bedingung 1: kein Tool-Use mehr → fertig
        if not tool_uses:
            updated_draft = draft
            next_action = _infer_next_action(updated_draft, assistant_text)
            return {
                "assistant_message": assistant_text
                    or "Ich konnte gerade nicht antworten — versuchen Sie es bitte noch einmal.",
                "updated_draft": updated_draft,
                "next_action": next_action,
                "tool_trace": tool_trace,
            }

        # Stop-Bedingung 2: Tool-Use → ausführen und in History anhängen
        # Erst die Assistant-Response (mit tool_use-Blocks) anhängen
        messages.append({
            "role": "assistant",
            "content": _content_blocks_for_history(content_blocks),
        })
        # Dann die Tool-Results sammeln
        tool_results_for_message: list[dict[str, Any]] = []
        tool_outputs: list[dict[str, Any]] = []
        for tc in tool_uses:
            output = await _dispatch_tool(
                tc["name"], tc["input"] or {},
                db=db, anthropic_client=anthropic_client,
            )
            tool_outputs.append(output)
            tool_results_for_message.append({
                "type": "tool_result",
                "tool_use_id": tc["id"],
                "content": json.dumps(output, ensure_ascii=False),
            })
            tool_trace.append({
                "name": tc["name"], "input": tc["input"], "output": output,
            })
        messages.append({"role": "user", "content": tool_results_for_message})
        draft = _merge_tool_results_into_draft(draft, tool_uses, tool_outputs)
        # Server-Draft-Ref aktualisieren, damit der nächste Tool-Aufruf
        # (insb. bereite_uebernahme_vor) den vollen Stand sieht.
        _CURRENT_DRAFT_REF.set(draft)

        # Falls das LLM end_turn signalisiert und trotzdem noch tool_use
        # geliefert hat (sollte nicht passieren), brechen wir nach diesem
        # Loop-Durchgang ab — aber normaler Fall ist „tool_use" stop_reason.
        if stop_reason not in ("tool_use", None):
            break

    # Fallback wenn max_tool_iters überschritten
    return {
        "assistant_message": (
            "Entschuldigung, ich bin gerade in einer Endlos-Schleife geraten. "
            "Bitte starten Sie das Gespräch neu oder formulieren Sie Ihre "
            "Frage anders."
        ),
        "updated_draft": draft,
        "next_action": "error",
        "tool_trace": tool_trace,
    }


def _infer_next_action(draft: dict[str, Any], assistant_text: str) -> str:
    """Heuristische Nächste-Schritt-Markierung für die UI."""
    if draft.get("webformular_url"):
        # Frontend sieht das und triggert window.location.href = webformular_url
        return "ready_for_handoff"
    if draft.get("status") == "submitted":
        return "submitted"  # Legacy-Pfad, sollte nicht mehr getriggert werden
    if not draft.get("foerderbereich"):
        return "ask_foerderbereich"
    text_lower = assistant_text.lower() if assistant_text else ""
    if any(s in text_lower for s in (
        "soll ich den antrag", "darf ich den antrag", "antrag einreichen",
        "bestätigen sie", "passen alle angaben", "übergebe ich sie ans webformular",
    )):
        return "ready_to_submit"
    return "ask_field"


__all__ = ["run_agent_turn", "SYSTEM_PROMPT", "TOOL_SCHEMAS"]
