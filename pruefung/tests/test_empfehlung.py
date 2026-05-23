"""Tests für die Empfehlungs-Logik (models.py).

Drei-Wege-Entscheidung:
  - 0 Verstöße                                   → BEWILLIGEN
  - nur heilbare Verstöße (formal nachbesserbar) → RÜCKFRAGE
  - mindestens ein nicht-heilbarer Verstoß       → ABLEHNEN

Falsche Klassifizierung würde dazu führen, dass die KI dem
Sachbearbeiter falsche Schritte vorschlägt — z.B. Bewilligen
empfehlen, obwohl ein nicht-heilbarer Frist-Verstoß vorliegt.
"""
from pruefung.models import Befund, PruefungsErgebnis


def _hinweis(text: str) -> Befund:
    return Befund(schwere="hinweis", layer="A", beschreibung=text)


def _verstoss(text: str, layer: str = "B") -> Befund:
    return Befund(schwere="verstoss", layer=layer, beschreibung=text)


def test_empfehlung_bewilligen_bei_null_verstoessen():
    e = PruefungsErgebnis(befunde=[_hinweis("nur ein Hinweis"), _hinweis("noch einer")])
    emp = e.empfehlung()
    assert emp.aktion == "bewilligen"
    assert emp.heilbare_verstoesse == []
    assert emp.nicht_heilbare_verstoesse == []


def test_empfehlung_rueckfrage_bei_nur_heilbaren_verstoessen():
    # 'IBAN ungültig' steht NICHT in _NICHT_HEILBARE_MARKER → heilbar
    e = PruefungsErgebnis(befunde=[
        _verstoss("IBAN ungültig (ISO 13616 Modulo-97)", layer="A"),
        _verstoss("E-Mail ungültig (RFC 5322)", layer="A"),
    ])
    emp = e.empfehlung()
    assert emp.aktion == "rueckfrage"
    assert len(emp.heilbare_verstoesse) == 2
    assert emp.nicht_heilbare_verstoesse == []


def test_empfehlung_ablehnen_bei_verfristetem_antrag():
    e = PruefungsErgebnis(befunde=[_verstoss("Antrag ist verfristet")])
    emp = e.empfehlung()
    assert emp.aktion == "ablehnen"
    assert len(emp.nicht_heilbare_verstoesse) == 1


def test_empfehlung_ablehnen_bei_cap_ueberschreitung():
    e = PruefungsErgebnis(befunde=[
        _verstoss("Beantragte Summe übersteigt die AHP-Obergrenze von 10.000 EUR"),
    ])
    emp = e.empfehlung()
    assert emp.aktion == "ablehnen"


def test_empfehlung_ablehnen_wenn_einer_nicht_heilbar():
    # Eine Mischung: 1 nicht-heilbar + 1 heilbar → trotzdem ablehnen
    e = PruefungsErgebnis(befunde=[
        _verstoss("IBAN ungültig", layer="A"),                 # heilbar
        _verstoss("Sitz liegt nicht in der Stadt Würzburg"),   # nicht heilbar
    ])
    emp = e.empfehlung()
    assert emp.aktion == "ablehnen"
    assert len(emp.heilbare_verstoesse) == 1
    assert len(emp.nicht_heilbare_verstoesse) == 1


def test_empfehlung_ablehnen_bei_foerderlinie_noch_nicht_offen():
    # AHP 2.3.5 — Förderlinie noch nicht offen
    e = PruefungsErgebnis(befunde=[
        _verstoss("Diese Förderlinie ist erst ab Haushaltsjahr 2025 offen"),
    ])
    emp = e.empfehlung()
    assert emp.aktion == "ablehnen"


def test_empfehlung_rueckfrage_bei_anteilig_berechnete_hoechstauszahlung():
    """Anteilige Höchstauszahlung überschritten ist KEIN harter Ablehnungs-
    grund: eine reduzierte Bewilligung in Höhe der anteiligen Höchst-
    auszahlung wäre AHP-konform möglich (AHP 2.3.2/2.3.3). Empfehlung
    daher: rueckfrage mit Teilbewilligungs-Hinweis."""
    e = PruefungsErgebnis(befunde=[
        _verstoss("Anteilig berechnete Höchstauszahlung überschritten"),
    ])
    emp = e.empfehlung()
    assert emp.aktion == "rueckfrage"
    # Begründung muss den Teilbewilligungs-Hinweis enthalten
    assert "reduzierte Bewilligung" in emp.begruendung


def test_empfehlung_ablehnen_wenn_anteilig_kombiniert_mit_nicht_heilbarem():
    """Wenn zusätzlich zu anteiliger Überschreitung ein wirklich nicht-
    heilbarer Verstoß vorliegt (z.B. verfristet), bleibt es bei ablehnen."""
    e = PruefungsErgebnis(befunde=[
        _verstoss("Anteilig berechnete Höchstauszahlung überschritten"),
        _verstoss("Antrag ist verfristet"),
    ])
    emp = e.empfehlung()
    assert emp.aktion == "ablehnen"
