"""Tools, die der UE4-Agent (Sozialamt-Assistent) im Tool-Use-Loop aufrufen darf.

Designprinzipien (Halluzinations-Schutz, oberste Priorität):
- Jedes Tool validiert seinen Output HART gegen die bekannten Plugin-IDs.
- Kein Tool gibt Werte zurück, die das LLM frei erfinden könnte (FBs, Felder,
  Höchstgrenzen). Wenn unbekannt → explizit ``unknown=True`` markieren.
- ``tool_submit_antrag`` schreibt direkt via service-role in ``apl.antraege``
  (kein RLS-Bypass für andere Tabellen — wenn FB-spezifische Detail-Tabellen
  fehlen, wird der Antrag trotzdem angelegt und im Status ``eingegangen``
  vermerkt, damit die Sachbearbeitung ihn übernehmen kann).
"""
from __future__ import annotations

import json
import os
import re
import uuid
from typing import Any

from .foerderbereiche import PLUGINS, plugin_for


ALLOWED_FBS: set[str] = {"I", "II", "III", "IV"}
ALLOWED_FB_III_VARIANTEN: set[str] = {"A", "B", "C", "D"}

# Kurz-Beschreibungen der FBs/Varianten — werden dem LLM im System-Prompt
# UND im Klassifizierer-Tool-Call mitgegeben. Quelle: AHP-Richtlinie 2025.
FB_BESCHREIBUNGEN: dict[str, str] = {
    "I": "Aufbau niedrigschwelliger Angebote für Seniorinnen und Senioren "
         "(neue Projekte, einmalige Anschubfinanzierung).",
    "II": "Pauschale Förderung des bürgerschaftlichen Engagements — "
          "Ehrenamtsprojekte mit Helferliste (Besuchsdienst, "
          "Begleitservice, Telefonkette, Einkaufshilfe etc.).",
    "III": "Treffpunkte, Begegnungsstätten, Quartiersmanagement — "
           "regelmäßiger Betrieb. Vier Varianten: "
           "A=Mehrgenerationenhaus, B=Begegnungszentrum, "
           "C=Seniorenkreis (regelmäßige Treffen), D=Quartiersmanagement.",
    "IV": "Struktur- und Schwerpunktförderung der Seniorenarbeit — laut "
          "Stadt Würzburg FORMLOS (kein offizielles Formular). Der Bürger "
          "verfasst seinen Antrag selbst und lädt ihn als PDF hoch. "
          "Pflicht ist nur Antragsteller-/Bank-Block + dokument_path.",
}

FB_III_VARIANTEN_BESCHREIBUNGEN: dict[str, str] = {
    "A": "Mehrgenerationenhaus (MGH) — Bundesgefördert, "
         "max. 10.000 €/Jahr Kommunalanteil.",
    "B": "Begegnungszentrum — offene Veranstaltungen, "
         "max. 10.000 €/Jahr.",
    "C": "Seniorenkreis — regelmäßige Treffen (10/20/40+ p.a.), "
         "Staffelung 750 / 1.250 / 2.000 €/Jahr.",
    "D": "Quartiersmanagement — Hauptamtliche Koordination, "
         "max. 7.500 €/Jahr.",
}


# ── Tool 1: klassifiziere_foerderbereich ─────────────────────────────


KLASSIFIZIERUNGS_PROMPT_TEMPLATE = """\
Du klassifizierst eine Antrags-Beschreibung der Stadt Würzburg in einen
Förderbereich (AHP — Altenhilfe-Förderrichtlinie 2025).

Die EINZIG erlaubten Förderbereiche sind:
{fb_beschreibungen}

Bei FB III gibt es vier Varianten:
{variante_beschreibungen}

Beschreibung des Bürgers:
\"\"\"
{beschreibung}
\"\"\"

Antworte als JSON:
{{
  "fb": "I" | "II" | "III" | "IV" | null,
  "variante": "A" | "B" | "C" | "D" | null,
  "konfidenz": 0.0 - 1.0,
  "begruendung": "max 2 Sätze"
}}

Regeln:
- Nutze NUR die oben gelisteten FBs. KEINE Erfindungen.
- variante nur ausfüllen, wenn fb == "III".
- Wenn unsicher: fb=null, konfidenz<0.5. NICHT raten.
- Wenn die Beschreibung nicht zur Altenhilfe passt (z.B. KFZ, Bauantrag,
  Studium): fb=null, begruendung erklärt warum.
"""


def _build_klassifizierungs_prompt(beschreibung: str) -> str:
    fb_block = "\n".join(
        f"- FB {k}: {v}" for k, v in FB_BESCHREIBUNGEN.items()
    )
    var_block = "\n".join(
        f"- Variante {k}: {v}" for k, v in FB_III_VARIANTEN_BESCHREIBUNGEN.items()
    )
    return KLASSIFIZIERUNGS_PROMPT_TEMPLATE.format(
        fb_beschreibungen=fb_block,
        variante_beschreibungen=var_block,
        beschreibung=beschreibung,
    )


def _empty_klassifikation(grund: str) -> dict[str, Any]:
    return {
        "fb": None, "variante": None, "konfidenz": 0.0,
        "begruendung": grund[:500],
    }


async def tool_klassifiziere_foerderbereich(
    beschreibung: str,
    *,
    anthropic_client: Any | None = None,
    # Klassifikation in 4 FBs ist ein einfacher Routing-Task — Haiku
    # liefert hier dieselbe Qualität wie Sonnet 4.5, ist aber 3–4×
    # schneller und ~10× günstiger. Sonnet-Qualität war hier overkill
    # (kein freier Output, sondern Fixed-Choice-Klassifikation).
    # Via ENV überschreibbar, damit ein evtl. abweichendes Tag in
    # neueren API-Versionen ohne Rebuild korrigiert werden kann.
    model: str | None = None,
) -> dict[str, Any]:
    if model is None:
        model = os.environ.get("ANTHROPIC_KLASSIFIKATIONS_MODEL", "claude-haiku-4-5")
    """Klassifiziert eine Freitext-Beschreibung in einen FB.

    Returnt {fb, variante, konfidenz, begruendung}. fb ist garantiert
    in {None, "I", "II", "III", "IV"} — kein Pass-Through für vom LLM
    erfundene Werte.
    """
    beschreibung = (beschreibung or "").strip()
    if not beschreibung:
        return _empty_klassifikation("Keine Beschreibung übergeben.")

    if anthropic_client is None:
        from anthropic import AsyncAnthropic
        anthropic_client = AsyncAnthropic(
            api_key=os.environ["ANTHROPIC_API_KEY"],
        )

    response = await anthropic_client.messages.create(
        model=model,
        max_tokens=400,
        messages=[{
            "role": "user",
            "content": _build_klassifizierungs_prompt(beschreibung),
        }],
    )
    raw = response.content[0].text if response.content else ""
    raw_clean = raw.replace("```json", "").replace("```", "").strip()
    try:
        result = json.loads(raw_clean)
    except json.JSONDecodeError:
        return _empty_klassifikation(
            f"JSON-Parse fehlgeschlagen: {raw[:200]}",
        )
    if not isinstance(result, dict):
        return _empty_klassifikation(
            f"Unerwartetes Format: {type(result).__name__}",
        )

    fb = result.get("fb")
    if fb not in ALLOWED_FBS:
        # Inklusive None (= LLM hat ehrlich „weiß nicht" geliefert)
        # ist der explizit-leere Pfad — aber wir tragen die Begründung
        # weiter, damit der Agent dem User passend antworten kann.
        return {
            "fb": None, "variante": None,
            "konfidenz": 0.0,
            "begruendung": str(result.get("begruendung", ""))[:500]
                           or f"LLM lieferte unbekannten FB {fb!r}",
        }

    variante = result.get("variante")
    if fb != "III":
        variante = None
    elif variante not in ALLOWED_FB_III_VARIANTEN:
        variante = None

    konfidenz_raw = result.get("konfidenz", 0.0)
    try:
        konfidenz = max(0.0, min(1.0, float(konfidenz_raw)))
    except (TypeError, ValueError):
        konfidenz = 0.0

    return {
        "fb": fb,
        "variante": variante,
        "konfidenz": konfidenz,
        "begruendung": str(result.get("begruendung", ""))[:500],
    }


# ── Tool 2: get_pflichtfelder ────────────────────────────────────────


# Menschlich-lesbare Labels + Hinweise für die Pflichtfelder. Werden vom
# Agent verwendet, um den User höflich nach den nächsten Daten zu fragen.
FELD_LABELS: dict[str, dict[str, str]] = {
    # Antragsteller-Block (apl.antraege)
    "einrichtung": {
        "label": "Name der Einrichtung / des Vereins",
        "beispiel": "AWO Würzburg e.V.",
    },
    "ansprechpartner": {
        "label": "Ansprechpartner:in (Vor- und Nachname)",
        "beispiel": "Maria Müller",
    },
    "strasse": {"label": "Straße und Hausnummer", "beispiel": "Hauptstr. 12"},
    "plz": {"label": "Postleitzahl", "beispiel": "97070"},
    "ort": {"label": "Ort", "beispiel": "Würzburg"},
    "telefon": {"label": "Telefon-Nummer", "beispiel": "0931 12345"},
    "email": {"label": "E-Mail-Adresse", "beispiel": "kontakt@beispiel.de"},
    "bankname": {"label": "Name der Bank", "beispiel": "Sparkasse Mainfranken"},
    "iban": {"label": "IBAN", "beispiel": "DE89 3704 0044 0532 0130 00"},
    "bic": {"label": "BIC", "beispiel": "COBADEFFXXX"},
    "haushaltsjahr": {"label": "Haushaltsjahr", "beispiel": "2026"},
    # FB I
    "projekt_titel": {
        "label": "Titel des Projekts",
        "beispiel": "Demenz-Café Heuchelhof",
    },
    # FB II
    "ehrenamt_titel": {
        "label": "Titel des Ehrenamtsprojekts",
        "beispiel": "Besuchsdienst für Senior:innen",
    },
    "anzahl_helfer_vorjahr": {
        "label": "Anzahl der Helfer:innen im Vorjahr",
        "beispiel": "12",
    },
    "gesamt_helferstunden_vorjahr": {
        "label": "Summe der geleisteten Helferstunden im Vorjahr",
        "beispiel": "640",
    },
    # FB III (Basis)
    "variante": {
        "label": "FB-III-Variante (A/B/C/D)",
        "beispiel": "C",
    },
    "anlage_foerderbestaetigung_bund": {
        "label": "Bestätigung der Bundesförderung (PDF-Anlage)",
        "beispiel": "MGH-Bescheid 2025.pdf",
    },
    "b_anzahl_veranstaltungen": {
        "label": "Anzahl Veranstaltungen pro Jahr",
        "beispiel": "24",
    },
    "b_teilnehmer_senioren": {
        "label": "Geschätzte Teilnehmer:innen Senior:innen pro Jahr",
        "beispiel": "300",
    },
    "c_treffen_schwelle": {
        "label": "Treffen-Schwelle (GT_10 / GT_20 / GT_40)",
        "beispiel": "GT_20",
    },
    "c_teilnehmer_durchschnitt": {
        "label": "Durchschnittliche Teilnehmer:innen pro Treffen",
        "beispiel": "18",
    },
    "d_hauptamt_name": {
        "label": "Name der hauptamtlichen Koordinationskraft",
        "beispiel": "Anna Schmidt",
    },
    "d_hauptamt_stunden_woche": {
        "label": "Hauptamts-Wochenstunden",
        "beispiel": "20",
    },
    # FB IV — formlos (siehe docs/PDF-FELDER-AUDIT-2026-05-26.md).
    # `dokument_path` ist nach Migration 071 das einzige strukturelle
    # Pflichtfeld. `vorhaben_titel` und `kurzbeschreibung` sind optionale
    # KI-Hilfsfelder für die Vor-Klassifikation; sie haben keine PDF-Quelle.
    # `geplante_massnahmen`/`beantragte_summe_euro`/`laufzeit` waren
    # Erfindungen der ersten Implementierung (Halluzinationsrisiko) und
    # sind entfernt.
    "dokument_path": {
        "label": "Formloser PDF-Antrag (hochzuladen im Webformular)",
        "beispiel": "fb-iv-antrag-2026.pdf",
    },
    "vorhaben_titel": {
        "label": "Vorhaben-Titel (optional, nur als KI-Hilfe)",
        "beispiel": "Strukturförderung Quartier",
    },
    "kurzbeschreibung": {
        "label": "Kurzbeschreibung (optional, nur als KI-Hilfe)",
        "beispiel": "Aufbau eines Beirats...",
    },
}


def tool_get_pflichtfelder(
    fb: str | None, variante: str | None = None,
) -> dict[str, Any]:
    """Liefert die Pflichtfelder-Liste für den gewählten FB (+ Variante).

    Returnt {felder: [...], felder_mit_labels: [{name, label, beispiel}, ...]}
    oder {fehler: "...", felder: []} wenn der FB unbekannt ist.
    """
    if fb not in PLUGINS:
        return {
            "fehler": f"Unbekannter Förderbereich: {fb!r}",
            "felder": [], "felder_mit_labels": [],
        }
    plugin = plugin_for(fb)
    # FB III hat einen Variante-Parameter; alle anderen ignorieren ihn.
    if fb == "III":
        felder = plugin.get_pflicht_felder(variante)
    else:
        felder = plugin.get_pflicht_felder()
    felder_mit_labels = [
        {
            "name": f,
            "label": FELD_LABELS.get(f, {}).get("label", f),
            "beispiel": FELD_LABELS.get(f, {}).get("beispiel", ""),
        }
        for f in felder
    ]
    return {"felder": felder, "felder_mit_labels": felder_mit_labels}


# ── Tool 3: validate_field ───────────────────────────────────────────


_RE_EMAIL = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_RE_PLZ = re.compile(r"^\d{5}$")
_RE_TELEFON = re.compile(r"^[\d \-+/()]{4,}$")


def _validate_iban_mod97(iban: str) -> bool:
    """Mod-97-Check (ISO 13616). Akzeptiert nur DE-IBANs für unsere Demo."""
    cleaned = re.sub(r"\s+", "", iban).upper()
    if not re.match(r"^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$", cleaned):
        return False
    # Rotation: erste 4 Zeichen ans Ende
    rotated = cleaned[4:] + cleaned[:4]
    # Buchstaben → Zahlen (A=10, B=11, ...)
    expanded = "".join(
        str(ord(c) - 55) if c.isalpha() else c for c in rotated
    )
    try:
        return int(expanded) % 97 == 1
    except ValueError:
        return False


def tool_validate_field(field_name: str, value: str) -> dict[str, Any]:
    """Einfache Validatoren für die kritischsten Pflichtfelder.

    Returnt {ok: bool, fehler: str | None}. Unbekannte Felder werden
    akzeptiert, wenn ``value`` non-empty ist (kein false-positive in der
    Demo — die Sachbearbeitung prüft am Ende ohnehin alles in UE2/UE3).
    """
    if value is None or str(value).strip() == "":
        return {"ok": False, "fehler": "Wert ist leer."}
    value_str = str(value).strip()

    if field_name == "email":
        if not _RE_EMAIL.match(value_str):
            return {"ok": False, "fehler": "Keine gültige E-Mail-Adresse."}
    elif field_name == "iban":
        if not _validate_iban_mod97(value_str):
            return {"ok": False, "fehler": "IBAN ungültig (Prüfsumme stimmt nicht)."}
    elif field_name == "plz":
        if not _RE_PLZ.match(value_str):
            return {"ok": False, "fehler": "PLZ muss 5-stellig sein."}
    elif field_name == "telefon":
        if not _RE_TELEFON.match(value_str):
            return {"ok": False, "fehler": "Telefon-Nummer wirkt nicht plausibel."}
    elif field_name == "haushaltsjahr":
        if not re.match(r"^\d{4}$", value_str) or not (2024 <= int(value_str) <= 2030):
            return {"ok": False, "fehler": "Haushaltsjahr muss 4-stellig und realistisch sein."}
    elif field_name in {
        "anzahl_helfer_vorjahr", "gesamt_helferstunden_vorjahr",
        "b_anzahl_veranstaltungen", "b_teilnehmer_senioren",
        "c_teilnehmer_durchschnitt", "d_hauptamt_stunden_woche",
    }:
        if not value_str.isdigit() or int(value_str) < 0:
            return {"ok": False, "fehler": "Erwartet wird eine nicht-negative Zahl."}
    elif field_name == "variante":
        if value_str.upper() not in ALLOWED_FB_III_VARIANTEN:
            return {
                "ok": False,
                "fehler": "Variante muss A, B, C oder D sein.",
            }
    elif field_name == "c_treffen_schwelle":
        if value_str.upper() not in {"GT_10", "GT_20", "GT_40"}:
            return {
                "ok": False,
                "fehler": "Schwelle muss GT_10, GT_20 oder GT_40 sein.",
            }

    return {"ok": True, "fehler": None}


# ── Tool 4: submit_antrag ────────────────────────────────────────────


def _antragsnummer_gen(fb: str | None) -> str:
    """Schema: AHP-<JAHR>-<FB>-<6 Hex>. Deterministisch genug für Demo,
    keine DB-Sequenz nötig."""
    suffix = uuid.uuid4().hex[:6].upper()
    from datetime import datetime, UTC
    jahr = datetime.now(UTC).year
    fb_str = fb or "X"
    return f"AHP-{jahr}-{fb_str}-{suffix}"


# Felder, die direkt auf apl.antraege gemappt werden können. FB-spezifische
# Detail-Felder (b_*, c_*, d_*, projekt_titel, ehrenamt_titel etc.) landen
# im JSON-Notiz-Feld bzw. werden für die Demo nur protokolliert.
_ANTRAG_BASIS_FELDER = {
    "einrichtung", "ansprechpartner", "strasse", "hausnummer",
    "plz", "ort", "telefon", "email", "bankname", "iban", "bic",
    "haushaltsjahr", "foerderbereich",
}


async def tool_submit_antrag(
    draft: dict[str, Any], *, db: Any | None = None,
) -> dict[str, Any]:
    """Schreibt einen Demo-Antrag.

    Für die UE4-VL-Demo MVP: wir schreiben ausschließlich in ``apl.antraege``
    mit dem Antragsteller-Block + ``foerderbereich`` und packen die FB-
    spezifischen Felder als JSON in ``antragsdaten_jsonb`` (sofern Spalte
    existiert) oder verwerfen sie still für die Demo (Sachbearbeitung kann
    sie aus der Chat-History rekonstruieren).

    Returnt {antrag_id, antragsnummer, status}.
    """
    fb = draft.get("foerderbereich")
    antragsnummer = _antragsnummer_gen(fb)

    # In Test-/Dry-Run-Modus (db=None) liefern wir nur die generierte
    # Antragsnummer + einen synthetischen UUID — kein DB-Call.
    if db is None:
        return {
            "antrag_id": str(uuid.uuid4()),
            "antragsnummer": antragsnummer,
            "status": "demo_only_no_persist",
        }

    antragsteller = draft.get("antragsteller") or {}
    fb_specific = draft.get("fb_specific") or {}
    row: dict[str, Any] = {
        "antragsnummer": antragsnummer,
        "foerderbereich": fb,
        "status": "eingegangen",
    }
    # Antragsteller-Block übernehmen
    for k, v in antragsteller.items():
        if k in _ANTRAG_BASIS_FELDER and v not in (None, ""):
            row[k] = v
    # Haushaltsjahr (top-level oder im Antragsteller)
    if "haushaltsjahr" in antragsteller and antragsteller["haushaltsjahr"]:
        try:
            row["haushaltsjahr"] = int(antragsteller["haushaltsjahr"])
        except (TypeError, ValueError):
            pass

    try:
        inserted = await db.insert("antraege", row)
    except Exception as e:  # noqa: BLE001 — wir wollen die Fehlermeldung sehen
        return {
            "antrag_id": None,
            "antragsnummer": antragsnummer,
            "status": "fehler_beim_persistieren",
            "fehler": str(e)[:300],
        }

    antrag_id = inserted[0]["id"] if inserted else None
    # FB-Spezifika protokollieren — best-effort, nicht blockierend.
    # In einer echten Lösung würden wir hier in apl.fb_i_projekt / etc.
    # schreiben; für die VL-Demo reicht es, sie in der Antwort
    # mitzuliefern, damit der Sachbearbeiter sie sieht.
    return {
        "antrag_id": antrag_id,
        "antragsnummer": antragsnummer,
        "status": "submitted",
        "fb_specific_pending": fb_specific,
    }


async def tool_bereite_uebernahme_vor(
    draft: dict[str, Any],
    *,
    ue1_base_url: str = "https://antrag.butscher.cloud",
) -> dict[str, Any]:
    """Bereitet die Übergabe des gesammelten Drafts an das UE1-Webformular vor.

    Der Agent schreibt *nicht selbst* in apl.antraege. Stattdessen serialisiert
    er den Draft als URL-sicheres Base64-JSON und returnt eine UE1-URL mit
    Hash-Fragment. Das Frontend redirected dorthin; UE1 dekodiert das Hash,
    füllt sein Webformular vor und der Bürger sieht alles strukturiert,
    kann korrigieren und final selbst absenden.

    Vorteile gegenüber direct-submit:
      - Bürger hat Kontrolle über den finalen Schritt (echtes Webformular)
      - Keine "halbgaren" DB-Inserts wenn was schiefgeht
      - Konsistenz mit UE0→UE1-Hybrid-Brücke (gleiche Architektur)
      - Sachbearbeitung sieht später nur saubere, vom Bürger bestätigte Anträge
    """
    import base64
    payload = {
        "foerderbereich": draft.get("foerderbereich"),
        "fb_iii_variante": draft.get("fb_iii_variante"),
        "antragsteller": draft.get("antragsteller") or {},
        "fb_specific": draft.get("fb_specific") or {},
    }
    raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    b64 = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
    url = f"{ue1_base_url.rstrip('/')}/antrag/uebernahme-chat#{b64}"
    return {
        "status": "ready_for_handoff",
        "webformular_url": url,
        "payload_size_bytes": len(raw),
    }


__all__ = [
    "tool_klassifiziere_foerderbereich",
    "tool_get_pflichtfelder",
    "tool_validate_field",
    "tool_submit_antrag",
    "tool_bereite_uebernahme_vor",
    "FELD_LABELS",
    "FB_BESCHREIBUNGEN",
    "FB_III_VARIANTEN_BESCHREIBUNGEN",
    "ALLOWED_FBS",
    "ALLOWED_FB_III_VARIANTEN",
]
