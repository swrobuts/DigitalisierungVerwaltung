"""Layer B — Cross-Field-Plausibilität via JSON-Logic gegen apl2.ontologie_rules."""
from datetime import date
from typing import Any
from json_logic import jsonLogic
from pruefung.db import SupabaseClient
from pruefung.models import Befund


def evaluate_rule(condition: dict, facts: dict) -> Any:
    """Wrapper um jsonLogic, damit unsere Schnittstelle stabil bleibt
    (falls wir die Lib später wechseln)."""
    return jsonLogic(condition, facts)


def derive_facts(antrag: dict) -> dict:
    """Aus dem rohen Antrag werden abgeleitete Facts berechnet, auf die
    Regeln zugreifen können.

    Felder:
    - oeffnungstage_count: Anzahl Wochentage mit non-empty oeffnungszeit oder angebot
    - personalkosten_pro_oeffnungstag: personalkosten / oeffnungstage_count (0 falls keine)
    - antragsfrist_eingehalten: bool — antragsdatum ≤ haushaltsjahr-04-01
      (AHP 3.3 Antragsfristen). False bei Verfristung oder fehlendem Datum.
    """
    facts = dict(antrag)
    oz = antrag.get("oeffnungszeiten") or []
    tage = sum(
        1 for o in oz
        if (o.get("oeffnungszeit") or "").strip() or (o.get("angebot") or "").strip()
    )
    facts["oeffnungstage_count"] = tage
    pk = float(antrag.get("personalkosten_vorjahr_euro") or 0)
    facts["personalkosten_pro_oeffnungstag"] = pk / tage if tage > 0 else 0

    # AHP 3.3: Antragsfrist 1. April des Antragsjahres.
    # Fehlende Daten → als "nicht eingehalten" werten (führt zum Befund),
    # damit Bearbeiter prüft.
    facts["antragsfrist_eingehalten"] = _frist_eingehalten(
        antrag.get("antragsdatum"), antrag.get("haushaltsjahr"),
    )

    # AHP 2.3.2 / 2.3.3: max. Auszahlung = Cap × Stadtbewohner-Anteil.
    # Nur für Förderbereiche, deren AHP-Regel diese Skalierung vorsieht
    # (Begegnungszentren, Bildungsträger). Andere → None (Regel feuert nicht).
    facts["max_auszahlung_nach_anteil"] = _max_auszahlung_nach_anteil(
        antrag.get("foerderbereich"),
        antrag.get("stadtbewohner_anteil"),
    )
    return facts


# AHP-Caps pro Förderbereich (Quelle: Doctree-Version 2025-03-27, Kap. 2.3.x)
_CAP_PRO_FOERDERBEREICH: dict[str, float] = {
    "begegnungszentren": 10000.0,    # AHP 2.3.2
    "bildungstraeger":    6000.0,    # AHP 2.3.3
}


def _max_auszahlung_nach_anteil(
    foerderbereich: Any,
    stadtbewohner_anteil: Any,
) -> float | None:
    """Berechnet Cap × Anteil für skalierende Förderbereiche (BZ, Bildung).

    Returnt None wenn:
    - foerderbereich nicht in {begegnungszentren, bildungstraeger}, oder
    - stadtbewohner_anteil ist None (kann nicht berechnet werden — Hinweis-
      Regel foerdersumme_angegeben deckt das separat ab).
    """
    if foerderbereich not in _CAP_PRO_FOERDERBEREICH:
        return None
    if stadtbewohner_anteil is None:
        return None
    try:
        anteil = float(stadtbewohner_anteil)
    except (ValueError, TypeError):
        return None
    return _CAP_PRO_FOERDERBEREICH[foerderbereich] * anteil


def _frist_eingehalten(antragsdatum: Any, haushaltsjahr: Any) -> bool:
    """Prüft AHP 3.3: Antrag muss bis zum 1. April des Antragsjahres vorliegen."""
    if not antragsdatum or not haushaltsjahr:
        return False
    try:
        ad = antragsdatum if isinstance(antragsdatum, date) else date.fromisoformat(str(antragsdatum)[:10])
        hj = int(haushaltsjahr)
    except (ValueError, TypeError):
        return False
    return ad <= date(hj, 4, 1)


def _ist_verletzt(passt: Any) -> bool:
    """Eine Regel ist verletzt, wenn das JSON-Logic-Ergebnis falsy ist:
    False, oder numerische 0 (Lib kann je nach Operator beides liefern).
    None wird als 'nicht aussagekräftig' behandelt → nicht verletzt.
    """
    if passt is False:
        return True
    # Numerische 0, aber kein bool (True/False sind Subclass von int)
    if isinstance(passt, (int, float)) and not isinstance(passt, bool) and passt == 0:
        return True
    return False


async def check_ontologie(antrag: dict, plan_id: str, db: SupabaseClient) -> list[Befund]:
    """Evaluiert alle aktiven Regeln für plan_id gegen den Antrag.

    Eine Regel ist 'verletzt', wenn die JSON-Logic-Bedingung zu False
    oder 0 evaluiert. In diesem Fall wird ein Befund mit fehler_msg_de
    und der Schwere/paragraph_ref aus der DB-Zeile generiert.
    """
    rules = await db.select(
        "ontologie_rules",
        f"plan_id=eq.{plan_id}&aktiv=eq.true"
        f"&select=rule_name,condition_jsonb,fehler_msg_de,schwere,paragraph_ref",
    )
    facts = derive_facts(antrag)
    befunde: list[Befund] = []
    for r in rules:
        passt = evaluate_rule(r["condition_jsonb"], facts)
        if _ist_verletzt(passt):
            befunde.append(Befund(
                schwere=r["schwere"],
                layer="B",
                beschreibung=r["fehler_msg_de"],
                paragraph_ref=r.get("paragraph_ref"),
            ))
    return befunde
