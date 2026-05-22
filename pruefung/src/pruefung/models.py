"""Pydantic-Modelle für UE3-Prüfung."""
from typing import Literal
from pydantic import BaseModel, Field

Schwere = Literal["verstoss", "hinweis"]
LayerName = Literal["A", "B", "C"]


class Befund(BaseModel):
    schwere: Schwere
    layer: LayerName
    feld: str | None = None
    beschreibung: str
    zitat: str | None = None
    section_path: str | None = None
    paragraph_ref: str | None = None
    konfidenz: float | None = None


class PruefungsErgebnis(BaseModel):
    befunde: list[Befund] = Field(default_factory=list)
    doctree_version: str | None = None
    duration_ms: int | None = None

    def anzahl_verstoesse(self) -> int:
        return sum(1 for b in self.befunde if b.schwere == "verstoss")

    def anzahl_hinweise(self) -> int:
        return sum(1 for b in self.befunde if b.schwere == "hinweis")

    def pruefungsstatus(self) -> Literal["ok", "rueckfrage", "eskalation"]:
        v = self.anzahl_verstoesse()
        if v == 0:
            return "ok"
        if v < 3:
            return "rueckfrage"
        return "eskalation"


class PruefungsRequest(BaseModel):
    antrag_id: str
    geprueft_von: str | None = None
