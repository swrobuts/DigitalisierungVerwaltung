"""Vergleich eines Antrags mit dem Vorjahres-Antrag desselben Trägers.

Heuristischer Diff (kein KI-Aufruf) — liefert numerische und strukturelle
Änderungen, jeweils klassifiziert in `unauffaellig` / `auffaellig` /
`kritisch`. Das UI hebt insbesondere kritische Änderungen hervor.

Multi-FB-Schema (apl.antraege + fb_*-Detail-Tabellen):
- FB I: Vergleich personalkosten_euro + sachkosten_euro (aus fb_i_projekt)
- FB II/III/IV: kein direkt vergleichbarer Förderbetrag im Schema —
  Methode early-returnt mit klarer Begründung statt zu crashen.

Strukturelle Diffs gehen weiter über die gemeinsamen apl.antraege-Felder:
foerderbereich (Wechsel kritisch?), iban (kritisch), dachverband-Name etc.
"""
from typing import Any

from pruefung.db import SupabaseClient


# Strukturelle Felder — Änderungen sind binär (gleich/anders).
STRUKTURELLE_FELDER: dict[str, dict[str, Any]] = {
    "foerderbereich":         {"label": "Förderbereich", "schwere": "auffaellig"},
    "iban":                   {"label": "IBAN", "schwere": "kritisch"},
    "dachverband":            {"label": "Dachverband", "schwere": "auffaellig"},
    "einrichtung":            {"label": "Einrichtung", "schwere": "auffaellig"},
    "bankname":               {"label": "Bankname", "schwere": "auffaellig"},
}


_ANTRAG_SELECT = (
    "id,dachverband,einrichtung,haushaltsjahr,foerderbereich,iban,bankname"
)


async def vergleich_mit_vorjahr(antrag_id: str, db: SupabaseClient) -> dict[str, Any]:
    """Liefert {vorjahr: <antrag|null>, aenderungen: [...]} für UI-Konsum."""
    aktuelle = await db.select("antraege", f"id=eq.{antrag_id}&select={_ANTRAG_SELECT}")
    if not aktuelle:
        return {"vorjahr": None, "aenderungen": []}
    a = aktuelle[0]
    traeger_key = a.get("dachverband") or a.get("einrichtung")
    hj = a.get("haushaltsjahr")
    if not traeger_key or not hj:
        return {"vorjahr": None, "aenderungen": []}

    # Vorjahres-Antrag: erst dachverband, dann einrichtung
    vj_rows = await db.select(
        "antraege",
        f"dachverband=eq.{_quote(traeger_key)}"
        f"&haushaltsjahr=eq.{int(hj) - 1}&select={_ANTRAG_SELECT}&limit=1",
    )
    if not vj_rows:
        vj_rows = await db.select(
            "antraege",
            f"einrichtung=eq.{_quote(traeger_key)}"
            f"&haushaltsjahr=eq.{int(hj) - 1}&select={_ANTRAG_SELECT}&limit=1",
        )
    if not vj_rows:
        return {
            "vorjahr": None, "aenderungen": [],
            "aktuell_hj": hj, "gesucht_hj": int(hj) - 1,
        }

    v = vj_rows[0]
    aenderungen: list[dict[str, Any]] = []

    # FB-spezifische Numerik-Diffs
    fb = a.get("foerderbereich")
    if fb == "I" and v.get("foerderbereich") == "I":
        aenderungen.extend(await _diff_fb_i_summen(a, v, db))
    elif fb in ("II", "III", "IV"):
        # FB II/III/IV: kein numerischer Förderbetrag im Schema vergleichbar.
        # Wir liefern einen Hinweis, damit das UI sichtbar machen kann,
        # warum der numerische Vergleich entfällt (statt stillschweigend
        # leerer Liste).
        aenderungen.append({
            "feld": "_hinweis",
            "label": f"Förderbereich {fb}",
            "art": "info",
            "schwere": "unauffaellig",
            "begruendung": (
                f"Vorjahresvergleich der Fördersumme ist für FB {fb} aktuell "
                f"nicht implementiert — es gibt keine direkt vergleichbare "
                f"Summen-Spalte im fb_*-Detail-Schema."
            ),
        })

    # Strukturelle Diffs (gemeinsam für alle FBs)
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

    # Sortierung: kritisch zuerst
    schwere_rank = {"kritisch": 0, "auffaellig": 1, "unauffaellig": 2}
    aenderungen.sort(key=lambda x: schwere_rank.get(x["schwere"], 9))

    return {
        "vorjahr": {
            "id": v["id"],
            "haushaltsjahr": v.get("haushaltsjahr"),
            "dachverband": v.get("dachverband"),
            "einrichtung": v.get("einrichtung"),
        },
        "aktuell_hj": hj,
        "aenderungen": aenderungen,
        "anzahl_kritisch": sum(1 for x in aenderungen if x["schwere"] == "kritisch"),
        "anzahl_auffaellig": sum(1 for x in aenderungen if x["schwere"] == "auffaellig"),
    }


async def _diff_fb_i_summen(
    a: dict, v: dict, db: SupabaseClient,
) -> list[dict[str, Any]]:
    """Vergleicht personalkosten_euro + sachkosten_euro pro FB-I-Antrag.

    Klassifizierung:
    - > 100 % YoY → kritisch
    - > 30 %  YoY → auffaellig
    - sonst       → unauffaellig
    """
    sums = {}
    for label, row in (("aktuell", a), ("vorjahr", v)):
        rows = await db.select(
            "fb_i_projekt",
            f"antrag_id=eq.{row['id']}"
            "&select=personalkosten_euro,sachkosten_euro",
        )
        if not rows:
            sums[label] = 0.0
            continue
        r = rows[0]
        try:
            sums[label] = float(r.get("personalkosten_euro") or 0) + float(
                r.get("sachkosten_euro") or 0,
            )
        except (TypeError, ValueError):
            sums[label] = 0.0

    alt_f, neu_f = sums["vorjahr"], sums["aktuell"]
    if alt_f == 0 and neu_f == 0:
        return []
    if alt_f == 0:
        return [{
            "feld": "fb_details.personal+sach",
            "label": "Personal + Sachkosten (FB I)",
            "art": "numerisch", "format": "euro",
            "alt": alt_f, "neu": neu_f,
            "pct_veraenderung": None,
            "schwere": "kritisch" if neu_f > 0 else "unauffaellig",
        }]
    pct = ((neu_f - alt_f) / alt_f) * 100
    abs_pct = abs(pct)
    schwere = (
        "kritisch" if abs_pct >= 100 else
        "auffaellig" if abs_pct >= 30 else
        "unauffaellig"
    )
    return [{
        "feld": "fb_details.personal+sach",
        "label": "Personal + Sachkosten (FB I)",
        "art": "numerisch", "format": "euro",
        "alt": alt_f, "neu": neu_f,
        "pct_veraenderung": pct,
        "schwere": schwere,
    }]


def _quote(s: str) -> str:
    """PostgREST-Encoding für eq.<value> mit Sonderzeichen."""
    return s.replace(",", "%2C").replace("&", "%26").replace(" ", "%20")
