"""Anomalie-/Risiko-Score für die Inbox-Triage.

Heuristisch (kein KI-Aufruf) — kombiniert Vorjahres-Vergleich + statische
Auffälligkeitsmerkmale zu einem Score 0..100. Score-Wert ist optisches
Triagier-Werkzeug für den Sachbearbeiter, KEIN Entscheidungs-Input für die
finale Bewilligung (dafür ist Layer A/B/C zuständig).

Klassifizierung:
- 0..25: unauffällig (🟢)
- 26..50: prüfenswert (🟡)
- 51+:   erhöhtes Risiko (🔴)
"""
from typing import Any
from pruefung.db import SupabaseClient


SCORE_WEIGHTS = {
    "summen_anstieg_50": 30,       # YoY-Summen-Anstieg > 50%
    "neuer_traeger": 20,           # keine Vorjahres-Anträge gefunden
    "iban_inhaber_mismatch": 15,   # IBAN-Inhaber ≠ Trägername
    "stadtbewohner_anteil_lo": 10, # < 50% Würzburger
    "foerderbereich_wechsel": 25,  # Förderbereich-Wechsel YoY
    "vorjahr_bewilligt_minus": -10, # Vorjahres-Antrag wurde bewilligt
}


async def berechne_risiko_score(antrag_id: str, db: SupabaseClient) -> dict[str, Any]:
    """Returns {score, klasse, faktoren: [{name, gewicht, begruendung}]}."""
    select = (
        "id,traeger,haushaltsjahr,foerderbereich,iban,bankverbindung,"
        "stadtbewohner_anteil,geforderte_foerdersumme_euro"
    )
    rows = await db.select("antraege", f"id=eq.{antrag_id}&select={select}")
    if not rows:
        return {"score": 0, "klasse": "unauffaellig", "faktoren": []}
    a = rows[0]

    # Vorjahres-Antrag suchen (für YoY-Faktoren)
    vorjahr = None
    if a.get("traeger") and a.get("haushaltsjahr"):
        from pruefung.vergleich_vorjahr import _quote
        vj_rows = await db.select(
            "antraege",
            f"traeger=eq.{_quote(a['traeger'])}&haushaltsjahr=eq.{int(a['haushaltsjahr']) - 1}"
            f"&select={select}&limit=1",
        )
        vorjahr = vj_rows[0] if vj_rows else None

    faktoren: list[dict[str, Any]] = []
    score = 0

    if vorjahr is None:
        score += SCORE_WEIGHTS["neuer_traeger"]
        faktoren.append({
            "name": "neuer_traeger",
            "gewicht": SCORE_WEIGHTS["neuer_traeger"],
            "begruendung": "Keine Vorjahres-Anträge für diesen Träger gefunden.",
        })
    else:
        # Summen-Anstieg
        alt_summe = float(vorjahr.get("geforderte_foerdersumme_euro") or 0)
        neu_summe = float(a.get("geforderte_foerdersumme_euro") or 0)
        if alt_summe > 0:
            pct = (neu_summe - alt_summe) / alt_summe * 100
            if pct > 50:
                score += SCORE_WEIGHTS["summen_anstieg_50"]
                faktoren.append({
                    "name": "summen_anstieg_50",
                    "gewicht": SCORE_WEIGHTS["summen_anstieg_50"],
                    "begruendung": (
                        f"Beantragte Fördersumme {pct:+.0f}% gegenüber "
                        f"Vorjahr (€{alt_summe:.0f} → €{neu_summe:.0f})."
                    ),
                })
        # Förderbereich-Wechsel
        if vorjahr.get("foerderbereich") != a.get("foerderbereich"):
            score += SCORE_WEIGHTS["foerderbereich_wechsel"]
            faktoren.append({
                "name": "foerderbereich_wechsel",
                "gewicht": SCORE_WEIGHTS["foerderbereich_wechsel"],
                "begruendung": (
                    f"Förderbereich-Wechsel: {vorjahr.get('foerderbereich')} → "
                    f"{a.get('foerderbereich')}."
                ),
            })
        # Bonus, wenn Vorjahres-Antrag bewilligt wurde (vertrauenserweckend)
        # Vorjahres-Bescheid laden
        besch_rows = await db.select(
            "bescheide",
            f"antrag_id=eq.{vorjahr['id']}&entscheidung=eq.bewilligt"
            "&select=id&limit=1",
        )
        if besch_rows:
            score += SCORE_WEIGHTS["vorjahr_bewilligt_minus"]
            faktoren.append({
                "name": "vorjahr_bewilligt_minus",
                "gewicht": SCORE_WEIGHTS["vorjahr_bewilligt_minus"],
                "begruendung": "Vorjahres-Antrag desselben Trägers wurde bewilligt — etablierter Träger.",
            })

    # IBAN-Inhaber-Heuristik: Trägername sollte im bankverbindung-String
    # auftauchen (Substring-Match, ignore-case)
    iban = (a.get("iban") or "").strip()
    bankverbindung = (a.get("bankverbindung") or "").lower()
    traeger_lower = (a.get("traeger") or "").lower()
    if (
        iban
        and bankverbindung
        and traeger_lower
        and not _normalize(traeger_lower) in _normalize(bankverbindung)
        and not _normalize(bankverbindung) in _normalize(traeger_lower)
    ):
        score += SCORE_WEIGHTS["iban_inhaber_mismatch"]
        faktoren.append({
            "name": "iban_inhaber_mismatch",
            "gewicht": SCORE_WEIGHTS["iban_inhaber_mismatch"],
            "begruendung": (
                f"Bankverbindungs-Inhaber '{a.get('bankverbindung')}' deckt sich "
                f"nicht offensichtlich mit Trägername — manuelle Prüfung empfohlen."
            ),
        })

    # Stadtbewohner-Anteil
    anteil = a.get("stadtbewohner_anteil")
    if anteil is not None and float(anteil) < 0.5:
        score += SCORE_WEIGHTS["stadtbewohner_anteil_lo"]
        faktoren.append({
            "name": "stadtbewohner_anteil_lo",
            "gewicht": SCORE_WEIGHTS["stadtbewohner_anteil_lo"],
            "begruendung": (
                f"Nur {int(float(anteil) * 100)}% Würzburger Teilnehmer — "
                f"AHP fordert i.d.R. Mehrheit aus dem Stadtgebiet."
            ),
        })

    # Auf 0..100 klemmen
    score = max(0, min(100, score))
    klasse = "unauffaellig" if score <= 25 else "pruefenswert" if score <= 50 else "erhoeht"

    return {
        "score": score,
        "klasse": klasse,
        "faktoren": faktoren,
    }


def _normalize(s: str) -> str:
    """Whitespace + Sonderzeichen entfernen für loseren String-Vergleich."""
    return "".join(c for c in s.lower() if c.isalnum())
