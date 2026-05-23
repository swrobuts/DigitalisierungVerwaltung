"""Vergleich eines Antrags mit dem Vorjahres-Antrag desselben Trägers.

Heuristischer Diff (kein KI-Aufruf) — liefert numerische und strukturelle
Änderungen pro Feld, jeweils klassifiziert in `unauffaellig` / `auffaellig`
/ `kritisch`. Das UI hebt insbesondere kritische Änderungen hervor.

Lehrkontext: zeigt, dass nicht jede KI-Frage tatsächlich KI braucht —
einfache Geschäftsregeln decken die meisten 'temporal reasoning'-Fälle
schon ab. Eine KI-Erklärungs-Schicht (warum ist die Änderung plausibel?)
ist als spätere Iteration vorgesehen.
"""
from typing import Any
from pruefung.db import SupabaseClient


# Felder, die wir numerisch vergleichen, mit Schwellwerten für die
# Klassifizierung in Prozent-Veränderung gegenüber dem Vorjahr.
NUMERISCHE_FELDER: dict[str, dict[str, Any]] = {
    "geforderte_foerdersumme_euro": {
        "label": "Geforderte Fördersumme",
        "auffaellig_pct": 30,   # > 30% YoY = auffällig
        "kritisch_pct": 100,    # > 100% YoY = kritisch
        "format": "euro",
    },
    "anzahl_teilnehmer": {
        "label": "Anzahl Teilnehmer",
        "auffaellig_pct": 40,
        "kritisch_pct": 100,
        "format": "int",
    },
    "stadtbewohner_anteil": {
        "label": "Anteil Würzburger Teilnehmer",
        "auffaellig_pct": 25,
        "kritisch_pct": 50,
        "format": "pct",
    },
    "geleistete_stunden_jahr": {
        "label": "Geleistete Stunden pro Jahr",
        "auffaellig_pct": 40,
        "kritisch_pct": 100,
        "format": "int",
    },
    "anzahl_ehrenamtliche": {
        "label": "Anzahl Ehrenamtliche",
        "auffaellig_pct": 50,
        "kritisch_pct": 150,
        "format": "int",
    },
}

# Strukturelle Felder — Änderungen sind binär (gleich/anders), aber je nach
# Feld unterschiedlich kritisch.
STRUKTURELLE_FELDER: dict[str, dict[str, Any]] = {
    "foerderbereich":         {"label": "Förderbereich", "schwere": "auffaellig"},
    "iban":                   {"label": "IBAN", "schwere": "kritisch"},
    "raeume_unentgeltlich":   {"label": "Räume unentgeltlich", "schwere": "auffaellig"},
    "raeume_vorhanden":       {"label": "Räume vorhanden", "schwere": "auffaellig"},
    "logo_verwendet":         {"label": "Logo Stadt Würzburg verwendet", "schwere": "unauffaellig"},
    "finanzplanung_vorhanden": {"label": "Finanzplanung vorhanden", "schwere": "auffaellig"},
    "projektskizze_eingereicht": {"label": "Projektskizze eingereicht", "schwere": "auffaellig"},
}


async def vergleich_mit_vorjahr(antrag_id: str, db: SupabaseClient) -> dict[str, Any]:
    """Liefert {vorjahr: <antrag|null>, aenderungen: [...]} für UI-Konsum."""
    select = ",".join([
        "id", "traeger", "haushaltsjahr",
        *NUMERISCHE_FELDER.keys(),
        *STRUKTURELLE_FELDER.keys(),
    ])
    aktuelle = await db.select("antraege", f"id=eq.{antrag_id}&select={select}")
    if not aktuelle:
        return {"vorjahr": None, "aenderungen": []}
    a = aktuelle[0]
    traeger = a.get("traeger")
    hj = a.get("haushaltsjahr")
    if not traeger or not hj:
        return {"vorjahr": None, "aenderungen": []}

    # Vorjahres-Antrag suchen — gleicher Träger, hj-1
    # Träger-Match: exact string-match. Bei Tippfehlern müsste man fuzzy
    # matchen, das schenken wir uns für v1.
    vorjahr_rows = await db.select(
        "antraege",
        f"traeger=eq.{_quote(traeger)}&haushaltsjahr=eq.{int(hj) - 1}"
        f"&select={select}&limit=1",
    )
    if not vorjahr_rows:
        return {"vorjahr": None, "aenderungen": [], "aktuell_hj": hj, "gesucht_hj": int(hj) - 1}

    v = vorjahr_rows[0]
    aenderungen: list[dict[str, Any]] = []

    # Numerische Diffs
    for feld, meta in NUMERISCHE_FELDER.items():
        alt_v = v.get(feld)
        neu_v = a.get(feld)
        if alt_v is None and neu_v is None:
            continue
        try:
            alt_f = float(alt_v) if alt_v is not None else 0.0
            neu_f = float(neu_v) if neu_v is not None else 0.0
        except (TypeError, ValueError):
            continue
        # %-Veränderung; alt=0 → wir geben "von 0 auf X" als kritisch zurück
        if alt_f == 0 and neu_f == 0:
            continue
        pct: float | None
        if alt_f == 0:
            pct = None  # nicht berechenbar
            schwere = "kritisch" if neu_f > 0 else "unauffaellig"
        else:
            pct = ((neu_f - alt_f) / alt_f) * 100
            abs_pct = abs(pct)
            if abs_pct >= meta["kritisch_pct"]:
                schwere = "kritisch"
            elif abs_pct >= meta["auffaellig_pct"]:
                schwere = "auffaellig"
            else:
                schwere = "unauffaellig"
        aenderungen.append({
            "feld": feld,
            "label": meta["label"],
            "art": "numerisch",
            "format": meta["format"],
            "alt": alt_v,
            "neu": neu_v,
            "pct_veraenderung": pct,
            "schwere": schwere,
        })

    # Strukturelle Diffs
    for feld, meta in STRUKTURELLE_FELDER.items():
        alt_v = v.get(feld)
        neu_v = a.get(feld)
        if alt_v == neu_v:
            continue
        aenderungen.append({
            "feld": feld,
            "label": meta["label"],
            "art": "strukturell",
            "alt": alt_v,
            "neu": neu_v,
            "schwere": meta["schwere"],
        })

    # Sortierung: kritisch zuerst, dann auffällig, dann unauffällig
    schwere_rank = {"kritisch": 0, "auffaellig": 1, "unauffaellig": 2}
    aenderungen.sort(key=lambda x: schwere_rank.get(x["schwere"], 9))

    return {
        "vorjahr": {
            "id": v["id"],
            "haushaltsjahr": v.get("haushaltsjahr"),
            "traeger": v.get("traeger"),
        },
        "aktuell_hj": hj,
        "aenderungen": aenderungen,
        "anzahl_kritisch": sum(1 for x in aenderungen if x["schwere"] == "kritisch"),
        "anzahl_auffaellig": sum(1 for x in aenderungen if x["schwere"] == "auffaellig"),
    }


def _quote(s: str) -> str:
    """PostgREST-encoding für eq.<value> mit Sonderzeichen."""
    # PostgREST mag bestimmte Sonderzeichen in URL nicht ungekapselt
    return s.replace(",", "%2C").replace("&", "%26").replace(" ", "%20")
