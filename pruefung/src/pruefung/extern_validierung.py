"""Externe Validierung via Perplexity Sonar.

Layer D — "Daten extern": deckt eine wichtige KI-Schwäche ab. LLMs prüfen
Plausibilität, aber nicht Realität. Dieser Modul verbindet die Antragsdaten
mit der echten Welt (Web-Suche + LLM-Zusammenfassung mit Quellen).

Wichtige Einschränkungen:
- Personenbezogene Daten (Ansprechpartner, Email, Telefon) werden NICHT
  an die externe API geschickt. Nur institutionelle Daten (Träger,
  Adresse der Einrichtung, Einrichtungsname). DSGVO-Begründung: Verarbeitung
  zur Verwaltungs-Aufgabe, aber Datenminimierung muss gelten.
- Die Antworten sind Hinweise, nie Verstöße — Perplexity ist
  web-grounded, aber halluzinationsfrei ist es nicht. UI markiert
  alle Befunde explizit als 'externe Quelle, kann fehlerhaft sein'.
- Audit-Trail: jeder Befund persistiert die Quellen-URLs, sodass
  Sachbearbeiter:innen nachsehen können, woher der Hinweis kam.
"""
import json
import os
import re
from typing import Any
import httpx


PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions"
PERPLEXITY_MODEL = "sonar"

# Generischer System-Prompt für alle Validierungen — schärft Halluzinations-
# Toleranz und JSON-Struktur ein.
SYSTEM_PROMPT = """Du bist ein Verwaltungs-Validierungs-Assistent. Du
recherchierst kurz im Web und antwortest IMMER mit reinem JSON in einem
Code-Block (keine Fließtext-Antwort).

WICHTIG:
- Wenn du etwas nicht eindeutig belegen kannst, sage es ehrlich
  ('nicht eindeutig auffindbar') mit niedriger Konfidenz.
- Halluziniere KEINE Adressen, Registereinträge oder Firmierungen.
- Bevorzuge offizielle Quellen (Bistum, Kommune, Handelsregister,
  OpenStreetMap, Caritas-Register) gegenüber Blogs.
- Konfidenz konservativ angeben (0.0-1.0): nur ≥ 0.8 wenn die Antwort
  auf mehreren übereinstimmenden offiziellen Quellen basiert.
"""


async def _ask_perplexity(user_prompt: str) -> tuple[str, list[str]]:
    """Ruft Perplexity Sonar und liefert (Antwort-Text, Quellen-URLs)."""
    api_key = os.environ.get("PERPLEXITY_API_KEY")
    if not api_key:
        raise RuntimeError("PERPLEXITY_API_KEY nicht gesetzt")
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(
            PERPLEXITY_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": PERPLEXITY_MODEL,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.1,  # niedrig: deterministischer
            },
        )
        r.raise_for_status()
        data = r.json()
    text = data["choices"][0]["message"]["content"]
    # Sonar liefert Quellen unter "citations" (Liste von URLs) oder
    # "search_results" (Liste von Objekten mit url+title) — wir nehmen
    # das was da ist.
    quellen: list[str] = []
    for c_url in (data.get("citations") or []):
        if isinstance(c_url, str):
            quellen.append(c_url)
    for sr in (data.get("search_results") or []):
        if isinstance(sr, dict) and sr.get("url"):
            quellen.append(sr["url"])
    # dedup, max 5
    quellen = list(dict.fromkeys(quellen))[:5]
    return text, quellen


def _parse_json(text: str) -> dict[str, Any]:
    """Extrahiert das erste JSON-Objekt aus dem Antwort-Text."""
    # Versuche zuerst direkt zu parsen
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Sonst suche {...}
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    return {"_raw": text, "_parse_error": True}


async def validate_traeger(traeger: str, ort: str) -> dict[str, Any]:
    """Existiert der Träger? Ist die Rechtsform plausibel?"""
    prompt = f"""Recherchiere kurz: Existiert die Organisation "{traeger}"
in {ort}? Bevorzuge offizielle Quellen (Bistum, Handelsregister,
Kommune). Antworte als JSON:
{{
  "existiert": true|false|null,
  "rechtsform": "z.B. KdöR, e.V., GmbH, gGmbH" | null,
  "sitz_bestaetigt": true|false|null,
  "offizieller_sitz": "Adresse falls bekannt" | null,
  "kommentar": "1-2 Sätze in Deutsch",
  "konfidenz": 0.0-1.0
}}"""
    text, quellen = await _ask_perplexity(prompt)
    parsed = _parse_json(text)
    parsed["quellen"] = quellen
    parsed["frage"] = "Träger-Existenz + Rechtsform"
    return parsed


async def validate_adresse(strasse: str, hausnummer: str, plz: str, ort: str) -> dict[str, Any]:
    """Existiert die Adresse? Liegt sie im Stadtgebiet (nicht Landkreis)?"""
    prompt = f"""Existiert die Adresse "{strasse} {hausnummer}, {plz} {ort}"
laut OpenStreetMap oder offiziellen Geodaten? Liegt sie tatsächlich
im STADTGEBIET {ort} (nicht Landkreis/Umland)? Antworte als JSON:
{{
  "adresse_existiert": true|false|null,
  "plz_passt_zur_stadt": true|false|null,
  "im_stadtgebiet": true|false|null,
  "stadtteil": "z.B. Heidingsfeld" | null,
  "kommentar": "1-2 Sätze",
  "konfidenz": 0.0-1.0
}}"""
    text, quellen = await _ask_perplexity(prompt)
    parsed = _parse_json(text)
    parsed["quellen"] = quellen
    parsed["frage"] = "Adress-Existenz + Stadtgebiet"
    return parsed


async def validate_einrichtung(einrichtung: str, traeger: str, ort: str) -> dict[str, Any]:
    """Ist die Einrichtung öffentlich auffindbar? Passt sie zum Träger?"""
    prompt = f"""Recherchiere kurz: Gibt es in {ort} eine Einrichtung
namens "{einrichtung}", die von "{traeger}" betrieben wird? Antworte als JSON:
{{
  "einrichtung_auffindbar": true|false|null,
  "traeger_passt": true|false|null,
  "art_der_einrichtung": "z.B. Altentagesstätte, Begegnungszentrum" | null,
  "kommentar": "1-2 Sätze, ggf. Hinweis wenn Diskrepanz mit Träger",
  "konfidenz": 0.0-1.0
}}"""
    text, quellen = await _ask_perplexity(prompt)
    parsed = _parse_json(text)
    parsed["quellen"] = quellen
    parsed["frage"] = "Einrichtung-Existenz + Träger-Konsistenz"
    return parsed


def klassifiziere_befund(name: str, ergebnis: dict) -> dict[str, Any]:
    """Macht aus dem Perplexity-Roh-Ergebnis einen einheitlichen Befund
    mit Schwere für die UI.

    Schwere-Logik (alle 'hinweis', keine 'verstoss' — externe Quellen
    sind nie rechtsverbindlich):
      - hinweis_kritisch: klar widersprüchliches Faktum mit hoher Konfidenz
      - hinweis_neutral: bestätigt oder unklar
    """
    konfidenz = float(ergebnis.get("konfidenz") or 0)
    art = "neutral"
    titel = ergebnis.get("frage", name)

    # Heuristik je nach Validierungs-Typ
    if name == "traeger":
        if ergebnis.get("existiert") is False and konfidenz > 0.6:
            art = "kritisch"
        elif (
            ergebnis.get("sitz_bestaetigt") is False
            and konfidenz > 0.6
            and ergebnis.get("offizieller_sitz")
        ):
            art = "kritisch"
    elif name == "adresse":
        if ergebnis.get("adresse_existiert") is False and konfidenz > 0.7:
            art = "kritisch"
        elif ergebnis.get("im_stadtgebiet") is False and konfidenz > 0.7:
            art = "kritisch"
    elif name == "einrichtung":
        if (
            ergebnis.get("einrichtung_auffindbar") is False
            and konfidenz > 0.7
        ):
            art = "kritisch"
        elif ergebnis.get("traeger_passt") is False and konfidenz > 0.7:
            art = "kritisch"

    return {
        "name": name,
        "titel": titel,
        "art": art,
        "konfidenz": konfidenz,
        "kommentar": ergebnis.get("kommentar") or ergebnis.get("_raw") or "",
        "details": {k: v for k, v in ergebnis.items() if k not in ("kommentar", "quellen", "frage", "konfidenz", "_raw", "_parse_error")},
        "quellen": ergebnis.get("quellen") or [],
        "parse_fehler": bool(ergebnis.get("_parse_error")),
    }


async def validiere_alles(antrag: dict) -> list[dict[str, Any]]:
    """Triggert alle 3 Validierungen parallel und liefert klassifizierte
    Befunde zurück. Jeder Befund hat: name, titel, art, konfidenz,
    kommentar, details, quellen.

    Wir passieren KEINE personenbezogenen Daten (Ansprechpartner-Name,
    Email, Telefon) — bewusst Datenminimierung gemäß DSGVO."""
    import asyncio
    traeger = antrag.get("traeger", "")
    strasse = antrag.get("strasse", "")
    hausnummer = antrag.get("hausnummer", "")
    plz = antrag.get("plz", "")
    ort = antrag.get("ort", "Würzburg")
    einrichtung = antrag.get("name", "")

    coros: list = []
    keys: list[str] = []
    if traeger:
        coros.append(validate_traeger(traeger, ort))
        keys.append("traeger")
    if strasse and plz:
        coros.append(validate_adresse(strasse, hausnummer, plz, ort))
        keys.append("adresse")
    if einrichtung and traeger:
        coros.append(validate_einrichtung(einrichtung, traeger, ort))
        keys.append("einrichtung")

    results = await asyncio.gather(*coros, return_exceptions=True)
    befunde: list[dict] = []
    for key, res in zip(keys, results):
        if isinstance(res, Exception):
            befunde.append({
                "name": key,
                "titel": f"Validierung '{key}' fehlgeschlagen",
                "art": "fehler",
                "konfidenz": 0.0,
                "kommentar": f"{type(res).__name__}: {res}",
                "details": {},
                "quellen": [],
                "parse_fehler": False,
            })
        else:
            befunde.append(klassifiziere_befund(key, res))
    return befunde
