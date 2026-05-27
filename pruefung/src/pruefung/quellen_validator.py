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


# ───────────────────────────────────────────────────────────────────────────
# Phase 4A.3: Hard-Fail-Validator gegen apl.ahp_norm_statements (Spec §12.1)
# ───────────────────────────────────────────────────────────────────────────
#
# Der bisherige validiere_alle() läuft gegen den Doctree-JSON und liefert
# Soft-Fehler als Liste. Für den neuen apl.ahp_norm_statements-basierten
# Bescheid-Render baut Spec §12.1 zusätzlich einen Hard-Fail: jeder
# zitierte Paragraph im Bescheid-Text MUSS in apl.ahp_norm_statements
# existieren, sonst wird der Render abgebrochen. Kein Toggle, kein Soft-
# Fail — Halluzinations-Schutz hat oberste Priorität.


class QuellenValidationError(Exception):
    """Wird beim Bescheid-Render geworfen, wenn ein zitierter Paragraph
    nicht in apl.ahp_norm_statements existiert. Hard-Fail, kein Toggle."""


# Matcht '§ 2.3.4', '§2.3', '§ 4', '§ 2.3.4a' etc.  Wir nehmen nur den
# numerischen Teil (mit optionalem Buchstaben-Suffix) als Identifier.
_PARAGRAPH_RE = re.compile(r"§\s*([0-9]+(?:\.[0-9]+)*[a-z]?)")

# Bekannte externe Gesetzes-Tokens, die als Kontext das § disqualifizieren
# (= nicht AHP). Auch "SGB XII", "SGB V" etc. werden gefangen via die
# optionale römische Zahl.
_LAW_TOKEN = (
    r"(?:SGB(?:\s+[IVX]+)?"
    r"|VwGO|BGB|GG|AGSG|HGB|StGB|StPO|AO|VwVfG|VwZG|GwG|AGB)"
)
_LAW_BEFORE_RE = re.compile(rf"{_LAW_TOKEN}\s*$", re.IGNORECASE)
_LAW_AFTER_RE = re.compile(rf"\s*[\(\,/]?\s*{_LAW_TOKEN}\b", re.IGNORECASE)


def extract_paragraph_refs(text: str) -> list[str]:
    """Extrahiert alle AHP-'§ X.Y'-Zitate aus dem Text, sortiert + dedupliziert.

    Beispiele: '§ 2.3.4', '§2.1', '§ 4' werden gefangen.

    Ausgeschlossen werden Paragraphen aus externen Gesetzen (SGB, VwGO,
    BGB, GG, AGSG, etc.) — diese sollen NICHT gegen apl.ahp_norm_statements
    validiert werden. Beispiele die NICHT gefangen werden:
      - "SGB XII § 71 zu vermerken"
      - "§ 70 VwGO"
      - "§ 4 BGB"
    """
    if not text:
        return []
    refs: list[str] = []
    for m in _PARAGRAPH_RE.finditer(text):
        before = text[max(0, m.start() - 30) : m.start()]
        after = text[m.end() : m.end() + 40]
        if _LAW_BEFORE_RE.search(before):
            continue
        if _LAW_AFTER_RE.match(after):
            continue
        refs.append(m.group(1))
    return sorted(set(refs))


def _normalize_ref(ref: str) -> str:
    """'§ 2.3.4' → '2.3.4'. Tolerant gegen Whitespace, §-Zeichen, Lower-Case.

    Damit gleicht der Text-Match ('§ 2.3.4' im Bescheid) den DB-Ref
    ('§ 2.3.4' in apl.ahp_norm_statements.ref) auch dann ab, wenn das
    Whitespace zwischen § und Zahl variiert.
    """
    return re.sub(r"[§\s]+", "", ref or "").strip().lower()


async def lade_bekannte_refs(db: Any) -> set[str]:
    """Lädt alle aktiven ref-Werte aus apl.ahp_norm_statements.

    Args:
        db: SupabaseClient-Instanz (pruefung.db.SupabaseClient).

    Returns:
        Set normalisierter Refs (z.B. {'2.1', '2.3.4', '3.3', '4', 'agb.iban'}).
    """
    rows = await db.select(
        "ahp_norm_statements",
        "aktiv=eq.true&select=ref",
    )
    return {_normalize_ref(r["ref"]) for r in rows if r.get("ref")}


async def validiere_oder_abbrechen(
    bescheid_text: str,
    *,
    db: Any | None = None,
    bekannte_refs: set[str] | None = None,
    antrag_id: str | None = None,
) -> None:
    """Findet alle '§ X.Y'-Zitate im Bescheid-Text, prüft gegen
    apl.ahp_norm_statements. Wirft QuellenValidationError bei erfundenen
    Paragraphen — KEIN Soft-Fail, KEIN Override.

    Spec §12.1: Hard-Fail vor PDF-Render.

    Args:
        bescheid_text: gerendeter Bescheid-Text (HTML oder Markdown).
        db: SupabaseClient (wird genutzt, wenn bekannte_refs nicht übergeben).
        bekannte_refs: Optional vorgeladene Refs (für Tests/Mocking, oder
            wenn der Caller die Refs bereits geladen hat).
        antrag_id: Für die Fehlermeldung — kein funktionaler Einfluss.

    Raises:
        QuellenValidationError: Wenn mindestens ein zitierter Paragraph
            nicht in apl.ahp_norm_statements existiert.
        ValueError: Wenn weder db noch bekannte_refs übergeben werden.
    """
    if bekannte_refs is None:
        if db is None:
            raise ValueError(
                "validiere_oder_abbrechen braucht entweder `db` oder "
                "`bekannte_refs`."
            )
        bekannte_refs = await lade_bekannte_refs(db)

    refs_im_text = extract_paragraph_refs(bescheid_text)
    erfunden = sorted(
        r for r in refs_im_text
        if _normalize_ref(r) not in bekannte_refs
    )
    if erfunden:
        raise QuellenValidationError(
            f"Bescheid-Render abgebrochen: folgende § sind nicht in "
            f"apl.ahp_norm_statements vorhanden: {erfunden}. "
            f"(antrag_id={antrag_id})"
        )
