import pytest
from unittest.mock import patch
from pruefung.layer_c_rag import check_rag


@pytest.mark.asyncio
async def test_check_rag_returns_befunde_from_claude_output():
    """Wir mocken den Claude-Call (_run_claude_loop) und stellen sicher,
    dass die Befunde korrekt in unsere Befund-Modelle übersetzt werden."""
    tree = {
        "id": "root", "title": "AHP", "path": "", "level": 0,
        "content": "", "children": [
            {"id": "sec_4_2", "title": "§ 4.2 Miete", "path": "§ 4.2",
             "level": 1, "content": "Höchstgrenze 12000 €/Jahr.", "children": []},
        ],
    }
    antrag = {"miete_jahr_euro": 20000}

    fake_response = {
        "befunde": [
            {
                "schwere": "verstoss",
                "feld": "miete_jahr_euro",
                "beschreibung": "Miete übersteigt § 4.2-Höchstgrenze.",
                "zitat": "Höchstgrenze 12000 €/Jahr.",
                "section_path": "§ 4.2",
                "konfidenz": 0.95,
            }
        ]
    }

    async def fake_claude_loop(tree_arg, antrag_arg, model):
        return fake_response

    with patch("pruefung.layer_c_rag._run_claude_loop", fake_claude_loop):
        befunde = await check_rag(tree, antrag)

    assert len(befunde) == 1
    assert befunde[0].layer == "C"
    assert befunde[0].schwere == "verstoss"
    assert befunde[0].section_path == "§ 4.2"
    assert befunde[0].konfidenz == 0.95
    assert befunde[0].zitat == "Höchstgrenze 12000 €/Jahr."


@pytest.mark.asyncio
async def test_check_rag_handles_empty_befunde():
    """Claude meldet keine Befunde — Liste leer, kein Crash."""
    async def fake_empty(tree_arg, antrag_arg, model):
        return {"befunde": []}

    with patch("pruefung.layer_c_rag._run_claude_loop", fake_empty):
        befunde = await check_rag({"id": "root", "children": []}, {})
    assert befunde == []


@pytest.mark.asyncio
async def test_check_rag_handles_missing_fields_gracefully():
    """Claude liefert teilweise unvollständige Befunde — keine KeyError."""
    async def fake_partial(tree_arg, antrag_arg, model):
        return {
            "befunde": [
                {"schwere": "hinweis", "beschreibung": "minimal"},  # ohne feld/zitat/etc
            ]
        }

    with patch("pruefung.layer_c_rag._run_claude_loop", fake_partial):
        befunde = await check_rag({"id": "root", "children": []}, {})
    assert len(befunde) == 1
    assert befunde[0].layer == "C"
    assert befunde[0].schwere == "hinweis"
    assert befunde[0].beschreibung == "minimal"
    assert befunde[0].feld is None
    assert befunde[0].zitat is None
