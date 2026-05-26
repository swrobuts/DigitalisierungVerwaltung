"""Verwaltungs-Subsumtion für Bescheide.

Pro Layer-Befund wird der konkrete Sachverhalt aus dem Antrag mit dem
AHP-Norm-Wortlaut verknüpft und eine rechtliche Würdigung formuliert.
Schema: Sachverhalt → Norm-Wortlaut (aus Doctree) → Würdigung.
"""
from typing import Any


def euro(value: Any) -> str:
    if value is None:
        return "—"
    try:
        n = float(value)
    except (ValueError, TypeError):
        return str(value)
    return f"{n:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")


def percent(value: Any) -> str:
    if value is None:
        return "—"
    try:
        return f"{round(float(value) * 100)} %"
    except (ValueError, TypeError):
        return str(value)


def _quote(s: Any) -> str:
    """Wert in deutsche Anführungszeichen ohne Quote-Kollision."""
    return "„" + str(s if s is not None else "—") + "“"


# Labels & Höchstgrenzen kennen jetzt sowohl Enum-Keys ('I'/'II'/'III'/'IV')
# als auch die historischen Slug-Keys ('begegnungszentren' etc.). Der
# /api/bescheid-Endpoint übergibt den Enum-Key (apl.foerderbereich) — die
# Slug-Keys bleiben als Backward-Compat für Tests/Audit-Trails erhalten.
_FOERDERBEREICH_LABEL = {
    # Multi-FB-Enum (apl.foerderbereich)
    "I":   "Aufbau niedrigschwelliger Angebote (Förderbereich I)",
    "II":  "Pauschale Förderung bürgerschaftlichen Engagements (Förderbereich II)",
    "III": "Treffpunkte/Begegnungsstätten/Quartiersmanagement (Förderbereich III)",
    "IV":  "Struktur- und Schwerpunktförderung (Förderbereich IV)",
    # Legacy-Slug-Keys (Audit-Trail, deprecated)
    "aufbau_niedrigschwellige_angebote": "Aufbau niedrigschwelliger Angebote (Förderbereich I)",
    "buergerschaftliches_engagement":    "bürgerschaftliches Engagement (Förderbereich II)",
    "mehrgenerationenhaeuser":           "Mehrgenerationenhaus (Förderbereich III)",
    "begegnungszentren":                 "Begegnungszentrum (Förderbereich III)",
    "bildungstraeger":                   "Bildungsträger/-haus (Förderbereich III)",
    "seniorenkreise":                    "Seniorenkreis (Förderbereich III)",
    "quartiersmanagement_altenarbeit":   "Quartiersmanagement Altenarbeit (Förderbereich III)",
    "struktur_schwerpunktfoerderung":    "Struktur- und Schwerpunktförderung (Förderbereich IV)",
}

_FOERDERBEREICH_HOECHSTGRENZE = {
    # Enum-Keys — FB III & IV haben mehrere Stufen bzw. keine feste Grenze.
    # Wir nehmen die jeweils strengste/maximale FB-III-Stufe, FB I nicht
    # gedeckelt vom AHP (Projekt-Fördersumme einzelfallabhängig), FB IV
    # individuell — siehe FB-Plugin get_hoechstgrenze().
    "I":   None,
    "II":  4250,
    "III": 10000,  # Maximum (Variante A/B); FB-III-Plugin liefert Variante-genau
    "IV":  None,
    # Legacy-Slug-Keys (Audit-Trail)
    "aufbau_niedrigschwellige_angebote": 3000,
    # AHP 2.2: 750 € Pauschal + Staffel max 3.500 € = 4.250 €
    "buergerschaftliches_engagement":    4250,
    "mehrgenerationenhaeuser":          10000,
    "begegnungszentren":                10000,
    "bildungstraeger":                   6000,
    "seniorenkreise":                    2000,
    "quartiersmanagement_altenarbeit":   7500,
}


def get_hoechstgrenze(foerderbereich: str | None) -> float | None:
    """Förderhöchstgrenze (€/Jahr) für einen Förderbereich; None wenn
    Förderbereich unbekannt oder keine feste Grenze definiert.

    Akzeptiert sowohl Enum-Keys ('I'/'II'/'III'/'IV') als auch Legacy-
    Slug-Keys ('begegnungszentren' etc.).
    """
    if foerderbereich is None:
        return None
    return _FOERDERBEREICH_HOECHSTGRENZE.get(foerderbereich)


def build_subsumtion(
    befund: dict[str, Any],
    antrag: dict[str, Any],
) -> dict[str, str | None]:
    """Liefert pro Befund Sachverhalt und Würdigung; Norm-Wortlaut wird
    vom Caller aus dem Doctree ergänzt."""
    bes = (befund.get("beschreibung") or "").lower()
    paragraph_ref = befund.get("paragraph_ref") or ""

    iban = antrag.get("iban") or "—"
    plz = antrag.get("plz") or "—"
    ort = antrag.get("ort") or "—"
    email = antrag.get("email") or "—"
    # Neue apl.antraege-Felder mit Fallback auf Legacy-Aliase
    name = antrag.get("einrichtung") or antrag.get("name") or "—"
    traeger = (
        antrag.get("dachverband")
        or antrag.get("traeger")
        or antrag.get("einrichtung")
        or "—"
    )
    strasse = antrag.get("strasse") or "—"
    hausnummer = antrag.get("hausnummer") or "—"
    antragsdatum = _format_date(
        antrag.get("antragsdatum") or antrag.get("submitted_at")
    )
    haushaltsjahr = antrag.get("haushaltsjahr", "—")
    fb = antrag.get("foerderbereich")
    fb_label = _FOERDERBEREICH_LABEL.get(fb or "", fb or "—")
    hoechstgrenze = _FOERDERBEREICH_HOECHSTGRENZE.get(fb) if fb else None
    # Geforderte Summe: Legacy direkt, sonst FB-spezifisch aus fb_details
    forderung = antrag.get("geforderte_foerdersumme_euro")
    if forderung is None:
        forderung = _forderung_aus_fb_details(antrag)

    # Layer A — IBAN
    if "iban ungültig" in bes:
        return {
            "sachverhalt": f"Die im Antrag angegebene Bankverbindung lautet IBAN {iban}.",
            "wuerdigung": (
                "Eine Auszahlung des Zuschusses setzt eine technisch valide IBAN "
                "voraus (Prüfziffern-Check nach ISO 13616, Modulo-97). "
                "Die angegebene IBAN besteht diesen Check nicht — eine Über"
                "weisung wäre damit nicht durchführbar."
            ),
        }

    # Layer A — PLZ
    if bes.startswith("plz"):
        return {
            "sachverhalt": f"Im Antrag ist die Postleitzahl {_quote(plz)} angegeben.",
            "wuerdigung": (
                "Eine Postleitzahl muss aus genau fünf Ziffern bestehen. "
                "Der angegebene Wert entspricht diesem Format nicht."
            ),
        }

    # Layer A — E-Mail
    if "e-mail" in bes:
        return {
            "sachverhalt": f"Im Antrag ist als Kontakt-E-Mail {_quote(email)} hinterlegt.",
            "wuerdigung": (
                "Die angegebene E-Mail-Adresse entspricht nicht dem RFC-5322-Format. "
                "Eine offizielle Korrespondenz mit dem Antragsteller wäre nicht "
                "zuverlässig möglich."
            ),
        }

    # Layer B — Antragsfrist
    if "verfristet" in bes or "1. april" in bes:
        return {
            "sachverhalt": (
                f"Ihr Antrag wurde am {antragsdatum} für das Haushaltsjahr "
                f"{haushaltsjahr} eingereicht."
            ),
            "wuerdigung": (
                f"Die Antragsfrist für Haushaltsjahr {haushaltsjahr} endete am "
                f"1. April {haushaltsjahr}. Der Antrag gilt als verfristet und "
                "ist nach AHP 3.3 Antragsfrist grundsätzlich abzulehnen."
            ),
        }

    # Layer B — Sitz nicht Würzburg
    if "sitz" in bes and ("würzburg" in bes or "wuerzburg" in bes):
        return {
            "sachverhalt": (
                f"Der Träger {_quote(traeger)} hat seinen Sitz unter der Anschrift "
                f"{strasse} {hausnummer}, {plz} {ort}."
            ),
            "wuerdigung": (
                "Die Postleitzahl-Range des Stadtgebiets Würzburg umfasst "
                "97070–97084. Der Sitz des Trägers liegt außerhalb dieser "
                "Range — die Voraussetzung des AHP 3.1 "
                "(Antragsberechtigung) ist nicht erfüllt."
            ),
        }

    # Layer B — Förderhöchstgrenze überschritten
    if "übersteigt" in bes and "ahp-obergrenze" in bes:
        diff = (
            (float(forderung) - hoechstgrenze)
            if (forderung is not None and hoechstgrenze is not None)
            else None
        )
        return {
            "sachverhalt": (
                f"Sie beantragen einen Zuschuss in Höhe von {euro(forderung)} "
                f"für die Einrichtung {_quote(name)} ({fb_label})."
            ),
            "wuerdigung": (
                f"Die AHP-Förderrichtlinie setzt für diesen Förderbereich eine "
                f"pauschale Förderhöchstgrenze von {euro(hoechstgrenze)} pro "
                f"Jahr fest. Ihre Forderung übersteigt diesen Wert"
                + (f" um {euro(diff)}." if diff is not None else ".")
                + " Eine Bewilligung in voller Höhe ist nicht möglich."
            ),
        }

    # Layer B — Mindestens eine Kostenposition
    if "mindestens eine kostenposition" in bes:
        return {
            "sachverhalt": (
                "Im Antrag wurden keine Kostenpositionen (Betriebs-, Personal- "
                "oder Mietkosten) angegeben."
            ),
            "wuerdigung": (
                "Nach AHP 2.4 und 3.2 b) ist eine vollständige "
                "Finanzierungsplanung als Pflichtangabe vorzulegen — ohne "
                "diese ist die Förderfähigkeit nicht beurteilbar."
            ),
        }

    # Layer B — QM Altenarbeit ab 2025
    if "quartiersmanagement-altenarbeit-förderung" in bes:
        return {
            "sachverhalt": (
                f"Der Antrag bezieht sich auf das Haushaltsjahr {haushaltsjahr} "
                f"und den Förderbereich Quartiersmanagement Altenarbeit."
            ),
            "wuerdigung": (
                "Diese Förderlinie ist nach AHP 2.3 Pkt. 5 erst ab Haushaltsjahr "
                "2025 zugänglich. Eine Förderung für ein früheres Haushaltsjahr "
                "ist nicht vorgesehen."
            ),
        }

    # Layer B — Finanzplanung FB IV
    if "finanzierungsplanung" in bes:
        return {
            "sachverhalt": (
                "Der Antrag enthält keine vollständige Finanzierungsplanung "
                "(Ausgaben + Einnahmen)."
            ),
            "wuerdigung": (
                "AHP 2.4 (Förderbereich IV) verlangt eine Finanzierungs"
                "planung als Pflichtangabe. Ohne diese kann der Zuwendungs"
                "zweck nicht beurteilt werden."
            ),
        }

    # Layer B — Zuwendungszweck FB IV
    if "zuwendungszweck" in bes:
        return {
            "sachverhalt": (
                "Der Antrag enthält keine Beschreibung des Zuwendungszwecks."
            ),
            "wuerdigung": (
                "AHP 2.4 verlangt eine Erläuterung des Zuwendungszwecks "
                "mit angestrebten Zielen. Ohne diese Angabe kann das "
                "Sozialreferat keine Bewertung vornehmen."
            ),
        }

    # Layer B — Projektskizze FB I
    if "projektskizze" in bes:
        return {
            "sachverhalt": (
                "Der Antrag enthält keinen Hinweis auf eine mit dem Sozial"
                "referat abgestimmte Projektskizze."
            ),
            "wuerdigung": (
                "Nach AHP 2.1 ist bei Antragstellung im Förderbereich I "
                "eine Projektskizze vorzulegen, die mit der Leitung "
                "Seniorenarbeit (FB IIS) abgestimmt wurde."
            ),
        }

    # Fallback — generische Subsumtion
    return {
        "sachverhalt": (
            "Der Sachverhalt ergibt sich aus den eingereichten Antrags"
            "unterlagen."
        ),
        "wuerdigung": (
            f"Nach Prüfung gegen {paragraph_ref or 'die einschlägige AHP-Bestimmung'} "
            f"liegt folgender Befund vor: {befund.get('beschreibung','—')}"
        ),
    }


def _forderung_aus_fb_details(antrag: dict[str, Any]) -> float | None:
    """Ableitung der geforderten Summe aus FB-spezifischen Details.

    - FB I:  personalkosten_euro + sachkosten_euro (aus fb_i_projekt)
    - FB II/III/IV: kein direkter Förderbetrag im Schema (Pauschalen FB II,
      Variante-abhängig FB III, individuell FB IV) → None.
    """
    details = antrag.get("fb_details") or {}
    fb = antrag.get("foerderbereich")
    if fb == "I":
        try:
            return (
                float(details.get("personalkosten_euro") or 0)
                + float(details.get("sachkosten_euro") or 0)
            ) or None
        except (TypeError, ValueError):
            return None
    return None


def _format_date(v: Any) -> str:
    """ISO-Datum → '15.03.2026'."""
    if v is None:
        return "—"
    s = str(v)[:10]
    from datetime import datetime
    try:
        return datetime.strptime(s, "%Y-%m-%d").strftime("%d.%m.%Y")
    except ValueError:
        return s
