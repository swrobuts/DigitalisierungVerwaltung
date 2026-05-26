"""Pydantic-Modelle für UE3-Prüfung."""
from typing import Literal
from pydantic import BaseModel, Field

Schwere = Literal["verstoss", "hinweis"]
# A=strukturell, B=ontologie, C=RAG-Wortlaut, Z=adversarielle Zweitprüfung
LayerName = Literal["A", "B", "C", "Z"]


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

    def empfehlung(self) -> "Empfehlung":
        """Leitet eine Workflow-Empfehlung aus den Befunden ab.

        Logik:
        - 0 Verstöße → BEWILLIGEN
        - alle Verstöße im Sachbearbeiter-Spielraum lösbar (heilbar) →
          RÜCKFRAGE. Drei Sub-Fälle:
            a) Antragsteller kann nachbessern (IBAN-Korrektur, fehlendes
               Pflichtfeld, Förderbereich-Zuordnung)
            b) Antragsteller kann Forderung nach unten korrigieren
               (anteilige Höchstauszahlung überschritten — eine reduzierte
               Bewilligung wäre regelkonform möglich)
        - mindestens ein materiell nicht-heilbarer Verstoß → ABLEHNEN
          (verpasste Frist, Sitz außerhalb Würzburg, absolute
          Förderhöchstgrenze überschritten, Förderlinie nicht offen)
        """
        verstoesse = [b for b in self.befunde if b.schwere == "verstoss"]
        if not verstoesse:
            return Empfehlung(
                aktion="bewilligen",
                begruendung="Kein Verstoß gegen die AHP-Förderrichtlinie festgestellt.",
                heilbare_verstoesse=[],
                nicht_heilbare_verstoesse=[],
            )
        heilbar: list[str] = []
        nicht_heilbar: list[str] = []
        for b in verstoesse:
            if _ist_heilbar(b):
                heilbar.append(b.beschreibung)
            else:
                nicht_heilbar.append(b.beschreibung)
        if nicht_heilbar:
            return Empfehlung(
                aktion="ablehnen",
                begruendung=(
                    f"{len(nicht_heilbar)} nicht heilbare:r Verstoß/Verstöße — "
                    "Rückfrage würde am Sachverhalt nichts ändern (verpasste "
                    "Frist, Träger-Sitz außerhalb Würzburg oder absolute "
                    "Förderhöchstgrenze überschritten)."
                ),
                heilbare_verstoesse=heilbar,
                nicht_heilbare_verstoesse=nicht_heilbar,
            )
        # Sonderbegründung wenn anteilige Höchstauszahlung dabei ist:
        # explizit auf Teilbewilligungs-Option hinweisen, sonst klingt
        # 'Rückfrage' nach Antragsteller-Nachbesserung.
        anteilig_betroffen = any(
            "anteilig berechnete höchstauszahlung" in (h or "").lower()
            for h in heilbar
        )
        if anteilig_betroffen:
            begruendung = (
                f"{len(heilbar)} Verstoß/Verstöße — eine reduzierte "
                "Bewilligung in Höhe der anteiligen Förderhöchstgrenze "
                "wäre regelkonform möglich (AHP 2.3.2/2.3.3). Alternativ "
                "kann der Antragsteller mit aktualisierten Teilnehmerzahlen "
                "eine höhere Auszahlung erwirken."
            )
        else:
            begruendung = (
                f"{len(heilbar)} formal heilbare:r Verstoß/Verstöße — "
                "Träger kann nachbessern (Korrektur von IBAN, Pflichtfeldern, "
                "Förderbereich-Zuordnung)."
            )
        return Empfehlung(
            aktion="rueckfrage",
            begruendung=begruendung,
            heilbare_verstoesse=heilbar,
            nicht_heilbare_verstoesse=[],
        )


class Empfehlung(BaseModel):
    """Vorgeschlagene Workflow-Aktion auf Basis der Prüfungs-Befunde.
    Strikt eine Empfehlung — Sozialausschuss entscheidet (AHP 3.4)."""
    aktion: Literal["bewilligen", "rueckfrage", "ablehnen"]
    begruendung: str
    heilbare_verstoesse: list[str]
    nicht_heilbare_verstoesse: list[str]


# Klassifikation der bekannten Verstoß-Texte in heilbar / nicht heilbar.
# Heuristik anhand des `beschreibung`-Texts der Ontologie-Regeln (Migration 030)
# und Layer-A-Fixtexte.
_NICHT_HEILBARE_MARKER = (
    "verfristet",                       # AHP 3.3 — Frist verpasst, nicht reparabel
    "antragsfrist",                     # AHP 3.3 — LLM-Formulierung "Antragsfrist überschritten"
    "frist überschritten",              # AHP 3.3 — Variante derselben Aussage
    "frist abgelaufen",                 # AHP 3.3 — weitere Variante
    "sitz liegt nicht in der stadt",    # AHP 3.1 — Träger-Sitz, struktureller Mangel
    "ahp-obergrenze",                   # Förderhöchstgrenze in absoluter Höhe überschritten
    # "anteilig berechnete höchstauszahlung" gehört NICHT in diese Liste:
    # bei anteiliger Überschreitung ist eine reduzierte Bewilligung (auf
    # Höhe der anteiligen Förderhöchstgrenze) AHP-konform möglich. Daher
    # wird das in empfehlung() als heilbar behandelt → Empfehlung
    # 'rueckfragen' mit Teilbewilligungs-Hinweis statt 'ablehnen'.
    "förderbereich i ist auf maximal 3 jahre",  # AHP 2.1 — Befristung
    "ist erst ab haushaltsjahr 2025",   # AHP 2.3.5 — Förderlinie noch nicht offen
    "passt nicht zur ahp-staffelung",   # Treffenstaffel passt nicht
    "doppelförderung",                  # AHP § 4 — Doppelförderung ausgeschlossen
    "kein dachverband",                 # AHP 2.1 — FB I Dachverband Pflicht
    "ohne dachverband",                 # AHP 2.1 — Variante
)


def _ist_heilbar(befund: "Befund") -> bool:
    """Prüft ob ein Verstoß durch Nachbesserung des Antrags geheilt werden
    kann. Konservative Heuristik: bei Unsicherheit als 'nicht heilbar'
    werten (→ Ablehnungs-Empfehlung statt fälschlicher Rückfrage-Empfehlung)."""
    bes = (befund.beschreibung or "").lower()
    for marker in _NICHT_HEILBARE_MARKER:
        if marker in bes:
            return False
    return True


class PruefungsRequest(BaseModel):
    antrag_id: str
    geprueft_von: str | None = None
