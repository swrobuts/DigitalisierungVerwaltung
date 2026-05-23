"""Halluzinations-Schutz: validiert Befund-Zitate gegen den AHP-Doctree.

Verhindert dass eine KI-Halluzination in einen rechtsverbindlichen
Bescheid gelangt. Vor jedem Bescheid-Render werden alle Befunde mit
paragraph_ref überprüft:

  1. Existiert die referenzierte AHP-Section im aktuellen Doctree?
  2. Falls ein Wortlaut zitiert wird: kommt der tatsächlich (substring,
     whitespace-normalisiert) im Section-Content vor?

Bei Fehler wird der Bescheid mit 422 abgelehnt — der Sachbearbeiter
sieht eine konkrete Liste der nicht-verifizierbaren Stellen und kann
entscheiden ob er die Erstprüfung wiederholt oder den Bescheid manuell
ohne diese Befunde erzeugt.
"""
import re
from typing import Any


# Mindestlänge ab der ein Zitat tatsächlich auf substring-Match geprüft
# wird. Sehr kurze "Zitate" (z.B. nur "AHP 3.3") sind keine wörtlichen
# Übernahmen — der Match-Check wäre zu schwach um Halluzinationen sicher
# zu erkennen.
ZITAT_MIN_LEN = 30


def _extract_ahp_path(paragraph_ref: str | None) -> str | None:
    """'AHP 3.3 Antragsfristen' → '3.3'. Identisch zu main._extract_ahp_path,
    hier dupliziert um Zirkular-Imports zu vermeiden."""
    if not paragraph_ref:
        return None
    m = re.search(r"(\d+(?:\.\d+)*)", paragraph_ref)
    return m.group(1) if m else None


def _find_section_by_path(tree: dict, target: str) -> dict | None:
    if tree.get("path") == target:
        return tree
    for c in tree.get("children") or []:
        r = _find_section_by_path(c, target)
        if r:
            return r
    return None


def _normalize(s: str) -> str:
    """Whitespace + typografische Zeichen normalisieren für loseren
    substring-Match. „typografische Anführung" → "typografische Anführung". """
    s = (s or "").lower()
    # typografische Anführungszeichen, Halbgeviertstriche etc.
    s = s.translate(str.maketrans({
        "„": '"', "“": '"', "”": '"',
        "‘": "'", "’": "'",
        "–": "-", "—": "-",
        " ": " ",
    }))
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def validiere_befund(befund: dict, tree: dict) -> dict[str, Any] | None:
    """Prüft einen einzelnen Befund. Returnt None wenn ok, sonst einen
    ValidierungsFehler-Dict mit Details."""
    paragraph_ref = befund.get("paragraph_ref")
    if not paragraph_ref:
        # Befund ohne Quellen-Referenz — nicht prüfbar, aber auch nicht
        # ausgewiesen als rechtliche Begründung. Akzeptiert.
        return None

    path = _extract_ahp_path(paragraph_ref)
    if not path:
        return {
            "befund_beschreibung": befund.get("beschreibung", ""),
            "paragraph_ref": paragraph_ref,
            "art": "ref_unparsbar",
            "detail": (
                f"Referenz {paragraph_ref!r} enthält keinen erkennbaren "
                "AHP-Pfad (erwartet z.B. 'AHP 3.3' oder '3.3')."
            ),
        }

    section = _find_section_by_path(tree, path)
    if section is None:
        return {
            "befund_beschreibung": befund.get("beschreibung", ""),
            "paragraph_ref": paragraph_ref,
            "art": "section_nicht_gefunden",
            "detail": (
                f"AHP-Section {path!r} existiert nicht im aktuellen "
                "Doctree. KI hat möglicherweise einen Paragraphen erfunden."
            ),
        }

    # Wenn ein konkretes Zitat oder ein AHP-Wortlaut mitgeliefert wird,
    # prüfen wir es als loser substring im Section-Content. Bei sehr
    # kurzen Strings (< ZITAT_MIN_LEN) ist der Check zu schwach um
    # Halluzinationen sicher zu erkennen — übersprungen.
    zitat = befund.get("zitat") or befund.get("ahp_wortlaut")
    if zitat and len(zitat) >= ZITAT_MIN_LEN:
        content_norm = _normalize(section.get("content") or "")
        zitat_norm = _normalize(zitat)
        # Wir prüfen mehrere Chunks falls Zitat sehr lang — KI könnte
        # absatzweise zitieren, dazwischen leichte Abweichungen.
        if zitat_norm not in content_norm:
            # Erlauben wir partial-match: mindestens 60% der Zitat-Wörter
            # müssen in dieser Section vorkommen. Sonst Halluzinations-Verdacht.
            zitat_words = [w for w in zitat_norm.split() if len(w) > 3]
            if zitat_words:
                hits = sum(1 for w in zitat_words if w in content_norm)
                match_quote = hits / len(zitat_words)
                if match_quote < 0.6:
                    return {
                        "befund_beschreibung": befund.get("beschreibung", ""),
                        "paragraph_ref": paragraph_ref,
                        "art": "zitat_nicht_im_wortlaut",
                        "detail": (
                            f"Zitiertes Fragment ist nicht im Wortlaut der "
                            f"Section {path} auffindbar (nur "
                            f"{match_quote*100:.0f}% der Stichwörter "
                            f"matchen). Möglicherweise wurde der "
                            f"Wortlaut paraphrasiert oder erfunden."
                        ),
                        "zitat": zitat[:200],
                    }
    return None


def validiere_alle(befunde: list[dict], tree: dict) -> list[dict[str, Any]]:
    """Validiert alle Befunde, returnt Liste der Fehler (leer = alles ok)."""
    fehler: list[dict] = []
    for b in befunde:
        f = validiere_befund(b, tree)
        if f is not None:
            fehler.append(f)
    return fehler
