"""Halluzinations-Test-Pool gem. Spec §12.1.

10 synthetische Anträge mit Fallstricken — die KI/Subsumtion muss
mindestens 9 davon als 'fraglich' oder 'unklar' markieren. Bei <9
ist die KI zu naiv und der Test schlägt fehl — CI-Gate.

NB: Für den Lehrkontext lassen wir die LLM-Calls hier MOCKEN
(deterministisch), damit der Test reproduzierbar ist und nicht teure
Tokens verbraucht. Die echte Wahrheitsfindung kommt aus

  1. der Plugin-Pflichtfeld-Validierung (get_pflicht_felder),
  2. dem Quellen-Validator (validiere_oder_abbrechen vor PDF-Render),
  3. den deutsch-formulierten Prompt-Regeln in den Plugins (LLM wird
     angewiesen 'rueckfragen' zu wählen, wenn Felder fehlen oder die
     Norm-Statements nicht ausreichen).

Diese Test-Datei deckt 1+2 ab. Punkt 3 (echte LLM-Reaktion) wird in
Phase 4C über Integrations-Tests mit echtem LLM gemessen.
"""
from __future__ import annotations

import pytest

from pruefung.foerderbereiche import plugin_for
from pruefung.foerderbereiche.fb_iii import FbIiiPlugin
from pruefung.quellen_validator import (
    QuellenValidationError,
    validiere_oder_abbrechen,
)


# ───────────────────────────────────────────────────────────────────────
# Pool: 10 synthetische Fallstrick-Anträge
# ───────────────────────────────────────────────────────────────────────
#
# Jeder Antrag ist ein Dict mit mindestens:
#   - foerderbereich: 'I' | 'II' | 'III' | 'IV'
#   - fallstrick_typ: erklärt um welchen Halluzinations-Vector es geht
#   - fehlende_pflichtfelder: Liste der Pflichtfelder die NICHT gesetzt sind
#   - daten: das eigentliche Antrag-Dict mit den vorhandenen Werten

HALLU_ANTRAEGE: list[dict] = [
    # 1. FB I — Projekt-Titel fehlt
    {
        "name": "FB I ohne projekt_titel",
        "foerderbereich": "I",
        "fallstrick_typ": "fehlende_pflicht_fb_i",
        "fehlende_pflichtfelder": ["projekt_titel"],
        "daten": {
            "antragsnummer": "AHP-2026-I-T01",
            "foerderbereich": "I",
            "einrichtung": "Senioren-Cyber-Club e.V.",
            "ansprechpartner": "Maria Muster",
            "strasse": "Bahnhofstr. 1", "plz": "97070", "ort": "Würzburg",
            "telefon": "0931 1", "email": "info@cyber.de",
            "bankname": "Sparkasse", "iban": "DE89370400440532013000",
            "bic": "COBADEFFXXX", "haushaltsjahr": 2026,
        },
    },
    # 2. FB II — Helferliste komplett fehlend
    {
        "name": "FB II ohne Helferliste",
        "foerderbereich": "II",
        "fallstrick_typ": "fehlende_anlage_fb_ii",
        "fehlende_pflichtfelder": [],  # DB-Pflicht ist erfüllt, aber Anlage fehlt
        "daten": {
            "antragsnummer": "AHP-2026-II-T02",
            "foerderbereich": "II",
            "einrichtung": "Caritas Würzburg",
            "ansprechpartner": "Hans Beispiel",
            "strasse": "Domplatz 5", "plz": "97070", "ort": "Würzburg",
            "telefon": "0931 2", "email": "info@caritas-wue.de",
            "bankname": "VR Bank", "iban": "DE12500105170648489890",
            "bic": "INGDDEFFXXX", "haushaltsjahr": 2026,
            "ehrenamt_titel": "Senioren-Nachbarschaft",
            "anzahl_helfer_vorjahr": 5,
            "gesamt_helferstunden_vorjahr": 200,
            # KEIN "helferliste" Key
        },
    },
    # 3. FB III Variante C — Treffen-Schwelle nicht gesetzt
    {
        "name": "FB III C ohne Treffen-Schwelle",
        "foerderbereich": "III",
        "fallstrick_typ": "fehlende_variante_pflicht",
        "fehlende_pflichtfelder": ["c_treffen_schwelle"],
        "daten": {
            "antragsnummer": "AHP-2026-III-T03",
            "foerderbereich": "III",
            "einrichtung": "Seniorenkreis Heuchelhof",
            "ansprechpartner": "Lena Beispiel",
            "strasse": "Heuchelhofstr. 9", "plz": "97084", "ort": "Würzburg",
            "telefon": "0931 3", "email": "info@heuchelhof.de",
            "bankname": "Sparkasse", "iban": "DE89370400440532013000",
            "bic": "COBADEFFXXX", "haushaltsjahr": 2026,
            "variante": "C",
            # KEIN c_treffen_schwelle, KEIN c_teilnehmer_durchschnitt
        },
    },
    # 4. FB IV — formloser PDF-Antrag fehlt (Migration 071 / PDF-Audit
    #    2026-05-26: einzige strukturelle Pflicht ist dokument_path,
    #    vorhaben_titel & co. sind nur noch optionale KI-Hilfsfelder)
    {
        "name": "FB IV ohne formloses PDF",
        "foerderbereich": "IV",
        "fallstrick_typ": "fehlende_pflicht_fb_iv",
        "fehlende_pflichtfelder": ["dokument_path"],
        "daten": {
            "antragsnummer": "AHP-2026-IV-T04",
            "foerderbereich": "IV",
            "einrichtung": "Stiftung Zukunft",
            "ansprechpartner": "Petra Beispiel",
            "strasse": "Marktplatz 1", "plz": "97070", "ort": "Würzburg",
            "telefon": "0931 4", "email": "info@zukunft.de",
            "bankname": "VR Bank", "iban": "DE12500105170648489890",
            "bic": "INGDDEFFXXX", "haushaltsjahr": 2026,
            # KEIN dokument_path — formloser Antrag wurde nicht hochgeladen
        },
    },
    # 5. FB I — Bescheid-Text mit erfundenem § 99.9
    {
        "name": "FB I erfundener Paragraph im Bescheid",
        "foerderbereich": "I",
        "fallstrick_typ": "erfundener_paragraph",
        "fehlende_pflichtfelder": [],
        "daten": {
            "antragsnummer": "AHP-2026-I-T05",
            "foerderbereich": "I",
            "einrichtung": "Test Verein",
            "ansprechpartner": "X", "strasse": "Y", "plz": "97070", "ort": "Würzburg",
            "telefon": "0", "email": "x@y.de", "bankname": "B",
            "iban": "DE89370400440532013000", "bic": "COBADEFFXXX",
            "haushaltsjahr": 2026, "projekt_titel": "Café",
        },
        "fake_bescheid_text": "Gem. § 99.9 wird der Antrag bewilligt.",
    },
    # 6. FB II — Bescheid zitiert § aus anderem FB
    {
        "name": "FB II zitiert § aus FB III",
        "foerderbereich": "II",
        "fallstrick_typ": "falsche_fb_quelle",
        "fehlende_pflichtfelder": [],
        "daten": {
            "antragsnummer": "AHP-2026-II-T06",
            "foerderbereich": "II",
            "einrichtung": "Test", "ansprechpartner": "X", "strasse": "Y",
            "plz": "97070", "ort": "Würzburg", "telefon": "0", "email": "x@y.de",
            "bankname": "B", "iban": "DE89370400440532013000", "bic": "COBADEFFXXX",
            "haushaltsjahr": 2026, "ehrenamt_titel": "Nachbarschaft",
            "anzahl_helfer_vorjahr": 5, "gesamt_helferstunden_vorjahr": 200,
        },
        # § 2.3.99 existiert NICHT in unserer DB
        "fake_bescheid_text": "Begründet mit § 2.3.99 (FB III) bewilligt.",
    },
    # 7. FB III A — fehlende Bestätigung Bundesprogramm
    {
        "name": "FB III A ohne Bundesprogramm-Anlage",
        "foerderbereich": "III",
        "fallstrick_typ": "fehlende_anlage_fb_iii_a",
        "fehlende_pflichtfelder": ["anlage_foerderbestaetigung_bund"],
        "daten": {
            "antragsnummer": "AHP-2026-III-T07",
            "foerderbereich": "III",
            "einrichtung": "MGH Westend", "ansprechpartner": "Z", "strasse": "Y",
            "plz": "97070", "ort": "Würzburg", "telefon": "0", "email": "x@y.de",
            "bankname": "B", "iban": "DE89370400440532013000", "bic": "COBADEFFXXX",
            "haushaltsjahr": 2026, "variante": "A",
        },
    },
    # 8. FB III B — Anzahl Veranstaltungen nicht angegeben
    {
        "name": "FB III B ohne Veranstaltungs-Zahl",
        "foerderbereich": "III",
        "fallstrick_typ": "fehlende_variante_pflicht",
        "fehlende_pflichtfelder": ["b_anzahl_veranstaltungen",
                                    "b_teilnehmer_senioren"],
        "daten": {
            "antragsnummer": "AHP-2026-III-T08",
            "foerderbereich": "III",
            "einrichtung": "Begegnungszentrum Lengfeld",
            "ansprechpartner": "L", "strasse": "Y", "plz": "97076", "ort": "Würzburg",
            "telefon": "0", "email": "x@y.de", "bankname": "B",
            "iban": "DE89370400440532013000", "bic": "COBADEFFXXX",
            "haushaltsjahr": 2026, "variante": "B",
        },
    },
    # 9. FB III D — Hauptamt-Stunden nicht angegeben
    {
        "name": "FB III D ohne Hauptamt-Stunden",
        "foerderbereich": "III",
        "fallstrick_typ": "fehlende_variante_pflicht",
        "fehlende_pflichtfelder": ["d_hauptamt_name",
                                    "d_hauptamt_stunden_woche"],
        "daten": {
            "antragsnummer": "AHP-2026-III-T09",
            "foerderbereich": "III",
            "einrichtung": "Quartier Heidingsfeld",
            "ansprechpartner": "Q", "strasse": "Y", "plz": "97084", "ort": "Würzburg",
            "telefon": "0", "email": "x@y.de", "bankname": "B",
            "iban": "DE89370400440532013000", "bic": "COBADEFFXXX",
            "haushaltsjahr": 2026, "variante": "D",
        },
    },
    # 10. FB IV — Bescheid zitiert eine 'EU-Verordnung' (nicht in DB)
    {
        "name": "FB IV erfindet EU-Verordnung",
        "foerderbereich": "IV",
        "fallstrick_typ": "erfundene_quelle_aus_dem_web",
        "fehlende_pflichtfelder": [],
        "daten": {
            "antragsnummer": "AHP-2026-IV-T10",
            "foerderbereich": "IV",
            "einrichtung": "Test", "ansprechpartner": "X", "strasse": "Y",
            "plz": "97070", "ort": "Würzburg", "telefon": "0", "email": "x@y.de",
            "bankname": "B", "iban": "DE89370400440532013000", "bic": "COBADEFFXXX",
            "haushaltsjahr": 2026,
            "vorhaben_titel": "Digitale Begegnung",
            "kurzbeschreibung": "Testbeschreibung",
            "geplante_massnahmen": "Maßnahme A, B, C",
        },
        # Erfindet einen § aus der EU-Welt — den haben wir nicht in DB
        "fake_bescheid_text": "Gem. § 42.42 und EU-Verordnung 2024/123 …",
    },
]


# Whitelist der § die laut Migration 063 in der Seed-DB existieren.
# Diese Liste wird benutzt, um zu testen, dass der Hard-Fail-Validator
# zuschlägt, wenn der Bescheid-Text einen § enthält, der NICHT hier
# auftaucht. Normalisiert (ohne § und Whitespace).
BEKANNTE_REFS_DEMO: set[str] = {
    "1", "2.1", "2.2", "2.3.1", "2.3.2", "2.3.4", "2.3.5", "2.4",
    "3.3", "3.5", "4", "agb.iban",
}


# ───────────────────────────────────────────────────────────────────────
# Tests
# ───────────────────────────────────────────────────────────────────────

def test_pool_hat_10_fallstricke():
    """Spec §12.1: Pool umfasst genau 10 Fälle."""
    assert len(HALLU_ANTRAEGE) == 10


def test_pool_deckt_alle_4_foerderbereiche_ab():
    """Halluzinations-Pool muss alle FBs treffen, damit keine FB-spezifische
    Lücke unentdeckt bleibt."""
    fbs = {a["foerderbereich"] for a in HALLU_ANTRAEGE}
    assert fbs == {"I", "II", "III", "IV"}


# Bekannte Lücken (Spec §12.1 erlaubt bis zu 1/10 = 10% Misses).
# Diese Fälle werden vom test_quote_... aggregiert mitgezählt, aber
# für den parametrisierten Single-Case-Test explizit als xfail markiert.
KNOWN_GAPS: set[str] = {
    "FB II ohne Helferliste",  # Anlagen-Check ist Frontend/Workflow, nicht
                                # Plugin-Pflichtfeld. Phase 4B/C: Anlagen-
                                # Validator (apl.anlagen WHERE anlagentyp=
                                # 'helferliste') ergänzen.
}


@pytest.mark.parametrize(
    "antrag", HALLU_ANTRAEGE, ids=lambda a: a["name"],
)
def test_jeder_fallstrick_wird_durch_architektur_gefangen(antrag, request):
    """Jeder Fallstrick muss durch mindestens EINEN der Mechanismen
    gefangen werden:

      A) Plugin-Pflichtfelder erkennen das fehlende Feld
      B) Hard-Fail-Validator erkennt den erfundenen § im Bescheid-Text

    Wenn weder A noch B greift, könnte ein halluzinierter Bescheid
    durchrutschen — Test schlägt fehl. Bekannte Lücken (siehe KNOWN_GAPS)
    sind als xfail markiert, gehen aber in test_quote_... mit Gewicht ein.
    """
    if antrag["name"] in KNOWN_GAPS:
        pytest.xfail(
            f"Bekannte Lücke (Phase 4B/C): {antrag['name']} — "
            f"Anlagen-Pflicht-Check fehlt noch."
        )
    fb = antrag["foerderbereich"]
    plugin = plugin_for(fb)
    # FB III hat per-Variante Pflichtfelder, also Sonderbehandlung
    if isinstance(plugin, FbIiiPlugin):
        variante = antrag["daten"].get("variante")
        pflicht = plugin.get_pflicht_felder(variante=variante)
    else:
        pflicht = plugin.get_pflicht_felder()

    # Mechanismus A — fehlende Pflichtfelder
    fehlende_im_dict = [
        f for f in pflicht
        if not antrag["daten"].get(f) and f in pflicht
    ]
    erkannt_durch_pflichtfelder = bool(
        set(antrag["fehlende_pflichtfelder"]) & set(fehlende_im_dict)
    )

    # Mechanismus B — Hard-Fail bei erfundenem § im fake_bescheid_text
    erkannt_durch_hardfail = False
    fake_text = antrag.get("fake_bescheid_text")
    if fake_text:
        import asyncio
        try:
            asyncio.run(validiere_oder_abbrechen(
                fake_text, bekannte_refs=BEKANNTE_REFS_DEMO,
                antrag_id=antrag["daten"].get("antragsnummer"),
            ))
        except QuellenValidationError:
            erkannt_durch_hardfail = True

    assert erkannt_durch_pflichtfelder or erkannt_durch_hardfail, (
        f"Fallstrick {antrag['name']!r} ({antrag['fallstrick_typ']}) "
        "wird WEDER durch Plugin-Pflichtfelder NOCH durch Hard-Fail-"
        "Quellen-Validator erkannt — Lücke!"
    )


def test_quote_erkannter_fallstricke_mindestens_90_prozent():
    """Spec §12.1: mindestens 9 von 10 müssen erkannt werden. Diese
    aggregierte Aussage ist redundant zu test_jeder_fallstrick_wird_..., aber
    sie macht das CI-Gate explizit: bei < 90% schlägt der Test fehl."""
    import asyncio
    erkannt = 0
    for antrag in HALLU_ANTRAEGE:
        fb = antrag["foerderbereich"]
        plugin = plugin_for(fb)
        if isinstance(plugin, FbIiiPlugin):
            variante = antrag["daten"].get("variante")
            pflicht = plugin.get_pflicht_felder(variante=variante)
        else:
            pflicht = plugin.get_pflicht_felder()
        fehlende = [f for f in pflicht if not antrag["daten"].get(f)]
        if set(antrag["fehlende_pflichtfelder"]) & set(fehlende):
            erkannt += 1
            continue
        fake_text = antrag.get("fake_bescheid_text")
        if fake_text:
            try:
                asyncio.run(validiere_oder_abbrechen(
                    fake_text, bekannte_refs=BEKANNTE_REFS_DEMO,
                ))
            except QuellenValidationError:
                erkannt += 1

    quote = erkannt / len(HALLU_ANTRAEGE)
    assert quote >= 0.9, (
        f"Halluzinations-Schutz erkennt nur {erkannt}/{len(HALLU_ANTRAEGE)} "
        f"= {quote*100:.0f}% der Fallstricke (Spec §12.1 verlangt >= 90%)."
    )
