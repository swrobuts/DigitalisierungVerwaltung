"""Anomalie-/Risiko-Score für die Inbox-Triage.

Heuristisch (kein KI-Aufruf) — kombiniert Vorjahres-Vergleich + statische
Auffälligkeitsmerkmale zu einem Score 0..100. Score-Wert ist optisches
Triagier-Werkzeug für den Sachbearbeiter, KEIN Entscheidungs-Input für die
finale Bewilligung (dafür ist Layer A/B/C zuständig).

Klassifizierung:
- 0..25: unauffällig
- 26..50: prüfenswert
- 51+:   erhöhtes Risiko

Schema: liest die neuen apl.antraege-Spalten (einrichtung/dachverband/
bankname) — alte Felder (traeger/bankverbindung/geforderte_foerdersumme_euro)
existieren nicht mehr. Geforderte Summe wird FB-spezifisch aus den
fb_*-Detail-Tabellen abgeleitet (FB I: personalkosten+sachkosten; sonst 0).
"""
from typing import Any
from pruefung.db import SupabaseClient


SCORE_WEIGHTS = {
    "summen_anstieg_50": 30,        # YoY-Summen-Anstieg > 50 %
    "neuer_traeger": 20,            # keine Vorjahres-Anträge gefunden
    "iban_inhaber_mismatch": 15,    # IBAN-Inhaber ≠ Einrichtungs-/Dachverband-Name
    "foerderbereich_wechsel": 25,   # Förderbereich-Wechsel YoY
    "vorjahr_bewilligt_minus": -10, # Vorjahres-Antrag wurde bewilligt
}

_ANTRAG_SELECT = (
    "id,dachverband,einrichtung,haushaltsjahr,foerderbereich,iban,bankname"
)


async def berechne_risiko_score(antrag_id: str, db: SupabaseClient) -> dict[str, Any]:
    """Returns {score, klasse, faktoren: [{name, gewicht, begruendung}]}."""
    rows = await db.select("antraege", f"id=eq.{antrag_id}&select={_ANTRAG_SELECT}")
    if not rows:
        return {"score": 0, "klasse": "unauffaellig", "faktoren": []}
    a = rows[0]

    # Träger-Identität für YoY-Suche: dachverband bevorzugt (stabiler über
    # Jahre hinweg), Fallback einrichtung
    traeger_key = a.get("dachverband") or a.get("einrichtung")
    aktuelle_summe = await _summe_fuer_antrag(a, db)

    # Vorjahres-Antrag suchen (für YoY-Faktoren)
    vorjahr = None
    if traeger_key and a.get("haushaltsjahr"):
        from pruefung.vergleich_vorjahr import _quote
        # Erst über dachverband suchen, dann über einrichtung
        vj_rows = await db.select(
            "antraege",
            f"dachverband=eq.{_quote(traeger_key)}"
            f"&haushaltsjahr=eq.{int(a['haushaltsjahr']) - 1}"
            f"&select={_ANTRAG_SELECT}&limit=1",
        )
        if not vj_rows:
            vj_rows = await db.select(
                "antraege",
                f"einrichtung=eq.{_quote(traeger_key)}"
                f"&haushaltsjahr=eq.{int(a['haushaltsjahr']) - 1}"
                f"&select={_ANTRAG_SELECT}&limit=1",
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
        alt_summe = await _summe_fuer_antrag(vorjahr, db)
        if alt_summe > 0 and aktuelle_summe > 0:
            pct = (aktuelle_summe - alt_summe) / alt_summe * 100
            if pct > 50:
                score += SCORE_WEIGHTS["summen_anstieg_50"]
                faktoren.append({
                    "name": "summen_anstieg_50",
                    "gewicht": SCORE_WEIGHTS["summen_anstieg_50"],
                    "begruendung": (
                        f"Beantragte Fördersumme {pct:+.0f}% gegenüber "
                        f"Vorjahr (€{alt_summe:.0f} → €{aktuelle_summe:.0f})."
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
        # Bonus, wenn Vorjahres-Antrag bewilligt wurde
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

    # IBAN-Inhaber-Heuristik: Trägername sollte im bankname-String auftauchen
    iban = (a.get("iban") or "").strip()
    bankname = (a.get("bankname") or "").lower()
    traeger_lower = (traeger_key or "").lower()
    if (
        iban
        and bankname
        and traeger_lower
        and not _normalize(traeger_lower) in _normalize(bankname)
        and not _normalize(bankname) in _normalize(traeger_lower)
    ):
        score += SCORE_WEIGHTS["iban_inhaber_mismatch"]
        faktoren.append({
            "name": "iban_inhaber_mismatch",
            "gewicht": SCORE_WEIGHTS["iban_inhaber_mismatch"],
            "begruendung": (
                f"Bankverbindungs-Inhaber '{a.get('bankname')}' deckt sich "
                f"nicht offensichtlich mit Trägername — manuelle Prüfung empfohlen."
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


async def _summe_fuer_antrag(antrag_row: dict, db: SupabaseClient) -> float:
    """Liest die FB-spezifische Förderhöhe für YoY-Vergleich.

    FB I: personalkosten_euro + sachkosten_euro aus apl.fb_i_projekt.
    FB II/III/IV: keine direkte Summe im Schema → 0 (kein YoY-Vergleich).
    """
    fb = antrag_row.get("foerderbereich")
    if fb != "I":
        return 0.0
    rows = await db.select(
        "fb_i_projekt",
        f"antrag_id=eq.{antrag_row['id']}"
        "&select=personalkosten_euro,sachkosten_euro",
    )
    if not rows:
        return 0.0
    r = rows[0]
    try:
        return float(r.get("personalkosten_euro") or 0) + float(
            r.get("sachkosten_euro") or 0,
        )
    except (TypeError, ValueError):
        return 0.0


def _normalize(s: str) -> str:
    """Whitespace + Sonderzeichen entfernen für loseren String-Vergleich."""
    return "".join(c for c in s.lower() if c.isalnum())
