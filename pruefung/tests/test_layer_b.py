import pytest
from unittest.mock import AsyncMock
from pruefung.layer_b_ontologie import evaluate_rule, derive_facts, check_ontologie


def test_evaluate_simple_rule_true():
    cond = {"==": [{"var": "raeume_unentgeltlich"}, "ja"]}
    assert evaluate_rule(cond, {"raeume_unentgeltlich": "ja"}) is True


def test_evaluate_simple_rule_false():
    cond = {"==": [{"var": "raeume_unentgeltlich"}, "ja"]}
    assert evaluate_rule(cond, {"raeume_unentgeltlich": "nein"}) is False


def test_evaluate_if_then_pattern():
    # Wenn unentgeltlich, dann miete=0
    cond = {"if": [
        {"==": [{"var": "raeume_unentgeltlich"}, "ja"]},
        {"==": [{"var": "miete_jahr_euro"}, 0]},
        True,
    ]}
    assert evaluate_rule(cond, {"raeume_unentgeltlich": "ja", "miete_jahr_euro": 0}) is True
    assert evaluate_rule(cond, {"raeume_unentgeltlich": "ja", "miete_jahr_euro": 500}) is False
    assert evaluate_rule(cond, {"raeume_unentgeltlich": "nein", "miete_jahr_euro": 500}) is True


def test_derive_facts_zaehlt_oeffnungstage():
    antrag = {
        "betriebskosten_vorjahr_euro": 100,
        "personalkosten_vorjahr_euro": 200,
        "oeffnungszeiten": [
            {"oeffnungszeit": "10-16", "angebot": "Kaffee"},
            {"oeffnungszeit": "", "angebot": ""},
            {"oeffnungszeit": "10-14", "angebot": "Bingo"},
        ],
    }
    facts = derive_facts(antrag)
    assert facts["oeffnungstage_count"] == 2
    assert facts["personalkosten_pro_oeffnungstag"] == 100  # 200/2


def test_derive_facts_keine_oeffnungstage_division_safe():
    """oeffnungstage_count=0 darf nicht in ZeroDivisionError laufen."""
    antrag = {
        "personalkosten_vorjahr_euro": 1000,
        "oeffnungszeiten": [],
    }
    facts = derive_facts(antrag)
    assert facts["oeffnungstage_count"] == 0
    assert facts["personalkosten_pro_oeffnungstag"] == 0


def test_derive_facts_keine_oeffnungszeiten_key():
    """Antrag ohne oeffnungszeiten-Key (None) darf nicht crashen."""
    antrag = {"personalkosten_vorjahr_euro": 500}
    facts = derive_facts(antrag)
    assert facts["oeffnungstage_count"] == 0


@pytest.mark.asyncio
async def test_check_ontologie_meldet_verstoss_wenn_regel_false():
    """Wenn Regel zu False evaluiert, kommt ein Befund mit der fehler_msg_de."""
    db = AsyncMock()
    db.select.return_value = [
        {
            "rule_name": "test_rule",
            "condition_jsonb": {"if": [
                {"==": [{"var": "raeume_unentgeltlich"}, "ja"]},
                {"==": [{"var": "miete_jahr_euro"}, 0]},
                True,
            ]},
            "fehler_msg_de": "Verstoß!",
            "schwere": "verstoss",
            "paragraph_ref": "§ 4.2",
        }
    ]
    antrag = {"raeume_unentgeltlich": "ja", "miete_jahr_euro": 500}
    befunde = await check_ontologie(antrag, plan_id="APL2", db=db)
    assert len(befunde) == 1
    assert befunde[0].schwere == "verstoss"
    assert befunde[0].layer == "B"
    assert befunde[0].beschreibung == "Verstoß!"
    assert befunde[0].paragraph_ref == "§ 4.2"


@pytest.mark.asyncio
async def test_check_ontologie_keine_befunde_wenn_alles_passt():
    db = AsyncMock()
    db.select.return_value = [
        {
            "rule_name": "ok_rule",
            "condition_jsonb": {"==": [{"var": "x"}, 1]},
            "fehler_msg_de": "x ist nicht 1",
            "schwere": "verstoss",
            "paragraph_ref": "§ 1",
        }
    ]
    befunde = await check_ontologie({"x": 1}, plan_id="APL2", db=db)
    assert befunde == []
