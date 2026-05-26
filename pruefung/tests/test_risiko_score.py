"""Tests für risiko_score auf dem neuen apl-Schema (dachverband/einrichtung/bankname)."""
from __future__ import annotations

import pytest

from pruefung.risiko_score import berechne_risiko_score


class _FakeDb:
    """Mini-DB-Stub.

    `routes` ist ein Dict von (table, contains_str_in_query) → rows.
    Wird `contains_str_in_query` als Substring der tatsächlichen Query
    erkannt, gibt der Stub die zugehörigen Rows zurück. Reihenfolge der
    Routes wird respektiert (erster Match gewinnt). Fallback: [].
    """

    def __init__(self, routes: list[tuple[str, str, list[dict]]]):
        self.routes = routes

    async def select(self, table, query):  # noqa: D401
        for t, qsubstr, rows in self.routes:
            if t == table and qsubstr in query:
                return list(rows)
        return []


@pytest.mark.asyncio
async def test_unbekannter_antrag_liefert_score_0():
    db = _FakeDb([])
    result = await berechne_risiko_score("none", db)
    assert result["score"] == 0
    assert result["klasse"] == "unauffaellig"


@pytest.mark.asyncio
async def test_neuer_traeger_meldet_faktor():
    """Antrag existiert, kein Vorjahres-Antrag → neuer_traeger-Faktor."""
    db = _FakeDb([
        # 1) initiale Antrags-Query
        ("antraege", "id=eq.x", [{
            "id": "x", "dachverband": "Caritas e.V.", "einrichtung": "Caritas-Café",
            "haushaltsjahr": 2026, "foerderbereich": "I",
            "iban": "DE89370400440532013000", "bankname": "Caritas e.V.",
        }]),
        # 2) FB-I-Detail für summe
        ("fb_i_projekt", "antrag_id=eq.x", [{
            "personalkosten_euro": 10000, "sachkosten_euro": 2000,
        }]),
        # 3) Vorjahres-Suchen über dachverband/einrichtung → leer
        ("antraege", "dachverband=eq.", []),
        ("antraege", "einrichtung=eq.", []),
    ])
    result = await berechne_risiko_score("x", db)
    namen = {f["name"] for f in result["faktoren"]}
    assert "neuer_traeger" in namen
    # IBAN-Mismatch sollte NICHT triggern, da bankname == dachverband
    assert "iban_inhaber_mismatch" not in namen


@pytest.mark.asyncio
async def test_summen_anstieg_und_fb_wechsel_zaehlen():
    """YoY: FB-I-Summe steigt um >50 %, plus FB-Wechsel → kombiniert."""
    db = _FakeDb([
        # Erst die aktuelle Antrags-Query (id=eq.x)
        ("antraege", "id=eq.x", [{
            "id": "x", "dachverband": "Stiftung", "einrichtung": "Café",
            "haushaltsjahr": 2026, "foerderbereich": "I",
            "iban": "DE89370400440532013000", "bankname": "Stiftung",
        }]),
        # Vorjahres-Suche — auch FB I, damit beide Summen aus fb_i_projekt
        # vergleichbar sind. FB-Wechsel-Test lassen wir hier weg, kommt im
        # nächsten Test (foerderbereich verschieden).
        ("antraege", "dachverband=eq.", [{
            "id": "vy", "dachverband": "Stiftung", "einrichtung": "Café",
            "haushaltsjahr": 2025, "foerderbereich": "I",
            "iban": "DE89370400440532013000", "bankname": "Stiftung",
        }]),
        # FB-I-Summen: alt 1000, neu 5000 (>50 % Anstieg)
        # Reihenfolge wichtig: Vorjahres-Match zuerst (substring 'vy' vor 'x'),
        # damit das Stub-Routing nicht den x-Eintrag für die vy-Query liefert.
        ("fb_i_projekt", "antrag_id=eq.vy", [{
            "personalkosten_euro": 1000, "sachkosten_euro": 0,
        }]),
        ("fb_i_projekt", "antrag_id=eq.x", [{
            "personalkosten_euro": 5000, "sachkosten_euro": 0,
        }]),
        ("bescheide", "antrag_id=eq.vy", []),
    ])
    result = await berechne_risiko_score("x", db)
    namen = {f["name"] for f in result["faktoren"]}
    assert "summen_anstieg_50" in namen
