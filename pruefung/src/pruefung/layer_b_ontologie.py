"""Layer B — Cross-Field-Plausibilität via JSON-Logic gegen apl.ontologie_rules.

TODO Phase 4A.2: apl.ontologie_rules existiert nicht (mehr) im neuen apl-Schema
(Migrationen 060-067). Die Cross-Field-Regeln müssen entweder neu auf
apl.ahp_norm_statements (statement_type='verpflichtung'/'verbot') angesetzt
werden, oder dieser Layer wird in Phase 4B/C durch Plugin-spezifische
Regeln pro Förderbereich abgelöst. Bis dahin schlägt check_ontologie() im
laufenden Service fehl, weil die Tabelle nicht existiert.
"""
from datetime import date
from typing import Any
from json_logic import jsonLogic
from pruefung.bescheid_subsumtion import get_hoechstgrenze
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
    - max_auszahlung: AHP-Förderhöchstgrenze für den Förderbereich (€/Jahr).
      None wenn Förderbereich unbekannt oder ohne feste Höchstgrenze (FB IV).
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

    # Maximale Auszahlung = AHP-Förderhöchstgrenze des Förderbereichs.
    # Die früher hier abgeleitete "anteilige" Reduktion via Stadtbewohner-
    # Anteil ist entfallen — der Anteilswert wird im Antragsprozess nicht
    # erhoben (weder PDF noch Webformular), also kann er nicht als
    # rechtsverbindliche Bemessungsgrundlage dienen.
    facts["max_auszahlung"] = get_hoechstgrenze(antrag.get("foerderbereich"))
    return facts


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
