"""Tests für norm_subsumtion — Layer-B KI-Subsumtion gegen ahp_norm_statements.

Halluzinations-Schutz (Robert-Regel): „Es darf NIE etwas erfunden oder
hinzugefügt werden, was weder in der Rechtsgrundlage noch in den PDFs
enthalten ist." → Erfundene `ref`-Werte vom LLM MÜSSEN verworfen werden;
`zitat` im Befund kommt aus der DB-Zeile, NICHT vom LLM.
"""
from __future__ import annotations

import pytest

from pruefung.norm_subsumtion import subsumiere_gegen_normstatements


class FakeDb:
    """Liefert 2 Norm-Statements für FB I bei Aufruf auf ahp_norm_statements."""

    async def select(self, table, query):  # noqa: ARG002
        if table == "ahp_norm_statements":
            return [
                {
                    "ref": "AHP 2.1",
                    "foerderbereich": "I",
                    "statement_typ": "zweck",
                    "kurz_aussage": "FB I dient dem Aufbau niedrigschwelliger Angebote.",
                    "woertliches_zitat": "Zuwendungen werden gewährt für den Aufbau neuer Angebote.",
                    "aktiv": True,
                },
                {
                    "ref": "AHP 2.2",
                    "foerderbereich": "I",
                    "statement_typ": "pflicht",
                    "kurz_aussage": "Projekt muss Senioren-Bezug nachweisen.",
                    "woertliches_zitat": (
                        "Das Vorhaben muss einen erkennbaren Bezug zur Seniorenarbeit haben."
                    ),
                    "aktiv": True,
                },
            ]
        return []


class FakePlugin:
    fb_id = "I"
    label = "FB I"

    def baue_subsumtions_prompt(self, antrag, norm_statements):  # noqa: ARG002
        return f"PROMPT for {len(norm_statements)} statements"


class FakeLlm:
    """Liefert 1 'passt' + 1 'passt_nicht' (legitim) + 1 erfundener ref."""

    async def subsumiere_normstatements(self, prompt):  # noqa: ARG002
        return [
            {
                "ref": "AHP 2.1",
                "beurteilung": "passt",
                "begruendung": "Projekt zielt auf neues Angebot.",
            },
            {
                "ref": "AHP 2.2",
                "beurteilung": "passt_nicht",
                "begruendung": "Antrag erwähnt nirgends Senioren als Zielgruppe.",
                "konfidenz": 0.85,
            },
            {
                "ref": "AHP 99.99",  # ERFUNDEN — muss vom Validator verworfen werden
                "beurteilung": "passt_nicht",
                "begruendung": "soll vom Validator verworfen werden.",
            },
        ]


@pytest.mark.asyncio
async def test_passt_nicht_wird_zu_verstoss_befund():
    befunde = await subsumiere_gegen_normstatements(
        antrag={"foerderbereich": "I", "einrichtung": "Café"},
        plugin=FakePlugin(),
        db=FakeDb(),
        llm=FakeLlm(),
    )
    refs = [b.paragraph_ref for b in befunde]
    assert "AHP 2.2" in refs
    # Halluzinations-Schutz: erfundener ref taucht NICHT als Befund auf
    assert "AHP 99.99" not in refs
    b = next(b for b in befunde if b.paragraph_ref == "AHP 2.2")
    assert b.schwere == "verstoss"
    assert b.layer == "B"
    # Zitat kommt aus der DB-Zeile (woertliches_zitat), NICHT vom LLM
    assert "Bezug zur Seniorenarbeit" in (b.zitat or "")
    assert b.konfidenz == 0.85


@pytest.mark.asyncio
async def test_passt_erzeugt_keinen_befund():
    befunde = await subsumiere_gegen_normstatements(
        antrag={"foerderbereich": "I"},
        plugin=FakePlugin(),
        db=FakeDb(),
        llm=FakeLlm(),
    )
    # 'passt'-Beurteilungen erzeugen explizit KEINEN Befund
    assert all(b.paragraph_ref != "AHP 2.1" for b in befunde)


@pytest.mark.asyncio
async def test_keine_norm_statements_keine_befunde():
    class EmptyDb:
        async def select(self, *a, **k):  # noqa: ARG002
            return []

    befunde = await subsumiere_gegen_normstatements(
        antrag={"foerderbereich": "I"},
        plugin=FakePlugin(),
        db=EmptyDb(),
        llm=FakeLlm(),
    )
    assert befunde == []


@pytest.mark.asyncio
async def test_unklar_wird_zu_hinweis_befund():
    """'unklar' soll als hinweis-Schwere durchgehen (nicht verworfen)."""

    class UnklarLlm:
        async def subsumiere_normstatements(self, prompt):  # noqa: ARG002
            return [
                {
                    "ref": "AHP 2.2",
                    "beurteilung": "unklar",
                    "begruendung": "Antrag ist mehrdeutig, manuelle Prüfung nötig.",
                },
            ]

    befunde = await subsumiere_gegen_normstatements(
        antrag={"foerderbereich": "I"},
        plugin=FakePlugin(),
        db=FakeDb(),
        llm=UnklarLlm(),
    )
    assert len(befunde) == 1
    assert befunde[0].schwere == "hinweis"
    assert befunde[0].layer == "B"
    assert befunde[0].paragraph_ref == "AHP 2.2"


@pytest.mark.asyncio
async def test_antrag_ohne_foerderbereich_keine_befunde():
    befunde = await subsumiere_gegen_normstatements(
        antrag={},
        plugin=FakePlugin(),
        db=FakeDb(),
        llm=FakeLlm(),
    )
    assert befunde == []
