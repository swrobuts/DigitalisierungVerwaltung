"""Dissens-Berechnung Erst-KI vs. Zweit-KI.

Liefert für eine Zweitprüfungs-Antwort eine Liste der Stellen, an denen
Erst- und Zweitprüfung NICHT übereinstimmen. Das Frontend hebt diese
Stellen in der Befunde-Liste optisch hervor.
"""
from typing import Any


def berechne_dissens(
    erst_befunde: list[dict],
    zweit_ergebnis: dict,
) -> list[dict[str, Any]]:
    """Erst-Befunde (Liste) + strukturierte Zweitprüfungs-Antwort
    (bestaetigte_befunde + widersprochene_befunde + neue_befunde) → Liste
    von Dissens-Einträgen.

    Schema pro Eintrag:
      {
        "erst_befund_index": int | None,
        "art": "widerspruch" | "neuer_befund" | "unbeantwortet",
        "erst": { "schwere": "...", "beschreibung": "..." } | None,
        "zweit": { ... } | None,
        "begruendung": str,
      }
    """
    dissens: list[dict[str, Any]] = []

    # 1) Widersprüche der Zweitprüfung gegen Erstbefunde
    bestaetigt_idx = {
        b.get("erst_befund_index")
        for b in (zweit_ergebnis.get("bestaetigte_befunde") or [])
        if b.get("erst_befund_index") is not None
    }
    widersprochen_map = {
        w.get("erst_befund_index"): w
        for w in (zweit_ergebnis.get("widersprochene_befunde") or [])
        if w.get("erst_befund_index") is not None
    }

    for idx, eb in enumerate(erst_befunde):
        w = widersprochen_map.get(idx)
        if w is not None:
            dissens.append({
                "erst_befund_index": idx,
                "art": "widerspruch",
                "erst": {
                    "schwere": eb.get("schwere"),
                    "beschreibung": eb.get("beschreibung"),
                },
                "zweit": {
                    "alternative_schwere": w.get("alternative_schwere"),
                    "begruendung": w.get("begruendung"),
                },
                "begruendung": w.get("begruendung", ""),
            })
            continue
        if idx not in bestaetigt_idx:
            # Zweitprüfung hat diesen Befund weder bestätigt noch
            # widersprochen — schwächere Form von Dissens (übersehen).
            dissens.append({
                "erst_befund_index": idx,
                "art": "unbeantwortet",
                "erst": {
                    "schwere": eb.get("schwere"),
                    "beschreibung": eb.get("beschreibung"),
                },
                "zweit": None,
                "begruendung": "Zweitprüfung hat sich zu diesem Befund nicht geäußert.",
            })

    # 2) Neue Befunde der Zweitprüfung sind per se Dissens (Erstprüfung
    #    hat sie nicht gefunden).
    for nb in (zweit_ergebnis.get("neue_befunde") or []):
        dissens.append({
            "erst_befund_index": None,
            "art": "neuer_befund",
            "erst": None,
            "zweit": {
                "schwere": nb.get("schwere"),
                "beschreibung": nb.get("beschreibung"),
                "paragraph_ref": nb.get("paragraph_ref"),
            },
            "begruendung": "Befund durch Zweitprüfung neu identifiziert.",
        })

    return dissens


def dissens_zusammenfassung(dissens: list[dict]) -> dict[str, int]:
    """Aggregiert die Dissens-Liste in Counts, für UI-Badge."""
    return {
        "widersprueche": sum(1 for d in dissens if d["art"] == "widerspruch"),
        "neue_befunde": sum(1 for d in dissens if d["art"] == "neuer_befund"),
        "unbeantwortet": sum(1 for d in dissens if d["art"] == "unbeantwortet"),
        "gesamt": len(dissens),
    }
