"""Adoption-Metriken — wie oft folgt die finale Entscheidung der KI?

Ziel: Automation Bias sichtbar machen. Ein Vier-Augen-Prinzip, in dem
99% der Bescheide der KI-Empfehlung folgen, ist effektiv kein
Vier-Augen-Prinzip mehr.

Aus bestehenden Daten ableitbar (keine neue Tabelle):
- pruefprotokoll.ergebnis_jsonb.empfehlung.aktion  → KI-Vorschlag
- bescheide.entscheidung                            → finale Entscheidung
- Match: bewilligen↔bewilligt, ablehnen↔abgelehnt, rueckfragen↔rueckfrage

Healthy-Bandbreite (Literatur): 60-80% Übernahme. Werte > 90% = Verdacht
auf Automation Bias. < 40% = KI-Empfehlung nicht hilfreich (überprüfen).
"""
from typing import Any
from pruefung.db import SupabaseClient


VORSCHLAG_ZU_ENTSCHEIDUNG = {
    "bewilligen": "bewilligt",
    "ablehnen": "abgelehnt",
    "rueckfragen": "rueckfrage",
}


async def berechne_adoption(db: SupabaseClient) -> dict[str, Any]:
    """Liefert Aggregat über alle Bescheide mit zugeordneter KI-Empfehlung."""
    # Alle Bescheide laden — pruefprotokoll_id verknüpft das auslösende
    # Protokoll. Wenn das Protokoll eine Empfehlung trägt, können wir
    # vergleichen.
    bescheide = await db.select(
        "bescheide",
        "select=id,entscheidung,pruefprotokoll_id,ausgestellt_am,bewilligte_summe_euro",
    )
    if not bescheide:
        return _leeres_aggregat()

    pp_ids = [b["pruefprotokoll_id"] for b in bescheide if b.get("pruefprotokoll_id")]
    if not pp_ids:
        # Es gibt Bescheide, aber keiner hat ein zugehöriges KI-Protokoll
        # (z.B. ausschließlich manuell erstellt). Alle zählen als 'ohne KI'.
        return _leeres_aggregat(
            anzahl_bescheide=len(bescheide),
            anzahl_ohne_ki=len(bescheide),
        )

    # in.(...) für PostgREST-Filter
    in_list = ",".join(f'"{p}"' for p in pp_ids)
    protokolle = await db.select(
        "pruefprotokoll",
        f"id=in.({in_list})&select=id,ergebnis_jsonb",
    )
    pp_map = {p["id"]: p for p in protokolle}

    paare: list[dict[str, Any]] = []
    for b in bescheide:
        pp_id = b.get("pruefprotokoll_id")
        if not pp_id:
            continue
        pp = pp_map.get(pp_id)
        if not pp:
            continue
        empfehlung_aktion = (
            (pp.get("ergebnis_jsonb") or {}).get("empfehlung") or {}
        ).get("aktion")
        if not empfehlung_aktion:
            continue
        erwartet = VORSCHLAG_ZU_ENTSCHEIDUNG.get(empfehlung_aktion)
        gefolgt = (erwartet == b["entscheidung"])
        paare.append({
            "bescheid_id": b["id"],
            "empfehlung": empfehlung_aktion,
            "entscheidung": b["entscheidung"],
            "gefolgt": gefolgt,
            "ausgestellt_am": b["ausgestellt_am"],
            "bewilligte_summe_euro": b.get("bewilligte_summe_euro"),
        })

    if not paare:
        return _leeres_aggregat(
            anzahl_bescheide=len(bescheide),
            anzahl_ohne_ki=len(bescheide),
        )

    anzahl_gefolgt = sum(1 for p in paare if p["gefolgt"])
    anzahl_ueberstimmt = len(paare) - anzahl_gefolgt
    uebernahme_quote = anzahl_gefolgt / len(paare)

    # Aufschlüsselung pro Empfehlungs-Aktion
    per_aktion: dict[str, dict[str, int]] = {}
    for p in paare:
        a = p["empfehlung"]
        per_aktion.setdefault(a, {"gefolgt": 0, "ueberstimmt": 0})
        per_aktion[a]["gefolgt" if p["gefolgt"] else "ueberstimmt"] += 1

    # Health-Klassifizierung
    if uebernahme_quote > 0.9:
        health = "automation_bias_verdacht"
        health_text = (
            "Sehr hohe Übernahme-Quote (>90 %) — Verdacht auf Automation "
            "Bias. Das Vier-Augen-Prinzip droht zur leeren Formalie zu "
            "werden, wenn die KI-Empfehlung faktisch nie mehr überstimmt "
            "wird."
        )
    elif uebernahme_quote < 0.4:
        health = "ki_unzuverlaessig"
        health_text = (
            "Niedrige Übernahme-Quote (<40%) — KI-Empfehlungen scheinen "
            "wenig hilfreich. Modell oder Regeln überprüfen."
        )
    else:
        health = "gesund"
        health_text = (
            "Übernahme-Quote im gesunden Bereich (40-90%) — KI ist Hilfe, "
            "Mensch entscheidet weiterhin substanziell."
        )

    return {
        "anzahl_bescheide_gesamt": len(bescheide),
        "anzahl_mit_ki_empfehlung": len(paare),
        "anzahl_ohne_ki_empfehlung": len(bescheide) - len(paare),
        "anzahl_gefolgt": anzahl_gefolgt,
        "anzahl_ueberstimmt": anzahl_ueberstimmt,
        "uebernahme_quote": round(uebernahme_quote, 3),
        "health": health,
        "health_text": health_text,
        "per_aktion": per_aktion,
        "letzte_paare": sorted(
            paare,
            key=lambda x: x.get("ausgestellt_am") or "",
            reverse=True,
        )[:10],
    }


def _leeres_aggregat(
    anzahl_bescheide: int = 0,
    anzahl_ohne_ki: int = 0,
) -> dict[str, Any]:
    return {
        "anzahl_bescheide_gesamt": anzahl_bescheide,
        "anzahl_mit_ki_empfehlung": 0,
        "anzahl_ohne_ki_empfehlung": anzahl_ohne_ki,
        "anzahl_gefolgt": 0,
        "anzahl_ueberstimmt": 0,
        "uebernahme_quote": 0,
        "health": "keine_daten",
        "health_text": "Noch keine Bescheide mit zugeordneter KI-Empfehlung.",
        "per_aktion": {},
        "letzte_paare": [],
    }
