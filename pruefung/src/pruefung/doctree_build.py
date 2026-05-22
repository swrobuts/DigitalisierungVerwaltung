"""PDF → Doc-Tree (PageIndex-Stil).

Zwei Build-Pfade:

1. `build_tree(blocks)` — Regex-Heuristik (Legacy). Erkennt Section-Header
   per Pattern `§ N(.M)*` oder numerisch `N(.M)* Title`. Schnell und
   deterministisch, aber zerbricht an OCR-Rauschen (Trailing-Dash-Titel,
   Il→II-Verwechslungen, Fußnoten als Sections, kaputte Hierarchie).

2. `structure_with_claude(pages)` — semantischer Strukturierer via
   Claude. OCR-Volltext je Seite → JSON-Tree mit korrekter Hierarchie,
   korrigiert OCR-Fehler, ignoriert TOC/Bibliografie. Produktiver Pfad
   für die AHP-Richtlinie (siehe /api/rebuild-doctree?engine=claude).

Tree-Schema:
{
  id: str,           # stable, z.B. "sec_4_2_1" oder "root"
  title: str,        # "§ 4.2.1 Mietkosten" oder "3.1 Antragsberechtigt"
  path: str,         # "§ 4.2.1" — Breadcrumb (leer bei root)
  level: int,        # 0=root, 1=§N, 2=§N.M, 3=§N.M.K, …
  content: str,      # Plain-Text der Section (ohne Kinder), accumulated
  children: list[<same>],
}
"""
import json
import os
import re
from pathlib import Path
from typing import Any

import pypdfium2 as pdfium
import pytesseract
from anthropic import AsyncAnthropic

# Section-Heading-Patterns (mehrere unterstützt):
#   Form A: "§ 4.2.1 Titel"  (klassische juristische Form)
#   Form B: "4.2.1 Titel"    (numerische Gliederung, AHP-Stil)
#   Form C: "4.2.1. Titel"   (numerische Gliederung mit Punkt am Ende)
SECTION_RE_PARAGRAPH = re.compile(r"^\s*§\s*(\d+(?:\.\d+)*)\s+(.+?)$")
SECTION_RE_NUMERIC = re.compile(r"^\s*(\d+(?:\.\d+)*)\.?\s+([A-ZÄÖÜ][\wäöüÄÖÜß\s,\-/&():.]{2,})$")

# Zeilen, die NUR aus Ziffern bestehen (links stehende Zeilennummern in vielen
# kommunalen Beschluss-PDFs) — werden ignoriert.
LINENUMBER_RE = re.compile(r"^\s*\d{1,4}\s*$")


def _match_section(line: str) -> tuple[str, str] | None:
    """Versucht beide Heading-Pattern. Returnt (num, title) oder None."""
    m = SECTION_RE_PARAGRAPH.match(line)
    if m:
        return m.group(1), m.group(2).strip()
    m = SECTION_RE_NUMERIC.match(line)
    if m:
        return m.group(1), m.group(2).strip()
    return None


# Backward-Compat (für bestehende Tests, die SECTION_RE importieren).
SECTION_RE = SECTION_RE_PARAGRAPH


def extract_text_blocks(pdf_path: Path) -> list[dict[str, Any]]:
    """Liest PDF und extrahiert Text-Zeilen als Blocks.

    Strategie:
    - Primär: pypdfium2-Text-Layer (schnell, deterministisch)
    - Fallback: Tesseract-OCR mit deutscher Sprache, wenn count_chars==0 (gescanntes PDF)

    Jede Zeile ein Block: {text, size, page}.
    size ist Heuristik (14 für Heading-Pattern, 11 sonst).
    """
    blocks: list[dict[str, Any]] = []
    pdf = pdfium.PdfDocument(str(pdf_path))
    try:
        for page_idx in range(len(pdf)):
            page = pdf[page_idx]
            tp = page.get_textpage()
            try:
                if tp.count_chars() > 0:
                    # Text-PDF: schneller pypdfium2-Pfad
                    text = tp.get_text_range()
                else:
                    # Gescanntes PDF: OCR-Fallback (Seite als Bitmap rendern + tesseract-deu)
                    bitmap = page.render(scale=2.0)  # höhere DPI für bessere OCR
                    pil_image = bitmap.to_pil()
                    text = pytesseract.image_to_string(pil_image, lang="deu")
            finally:
                tp.close()
            for raw_line in text.splitlines():
                line = raw_line.strip()
                if not line:
                    continue
                # Zeilennummern (1-4 Ziffern allein in der Zeile) sind Noise
                if LINENUMBER_RE.match(line):
                    continue
                is_section = _match_section(line) is not None
                blocks.append({
                    "text": line,
                    "size": 14 if is_section else 11,
                    "page": page_idx + 1,
                })
    finally:
        pdf.close()
    return blocks


def build_tree(blocks: list[dict[str, Any]]) -> dict[str, Any]:
    """Baut hierarchischen Tree aus Blocks.

    Section-Header (Pattern '§ N(.M)*') werden als Knoten, Folge-Zeilen
    werden als content der aktuellen Section angefügt.
    Verschachtelung über level (Punkt-Anzahl + 1).
    """
    root: dict[str, Any] = {
        "id": "root",
        "title": "AHP-Förderrichtlinie",
        "path": "",
        "level": 0,
        "content": "",
        "children": [],
    }
    # Stack: Liste von (level, node-ref) — top ist aktuelle Section
    stack: list[tuple[int, dict]] = [(0, root)]

    for blk in blocks:
        m = _match_section(blk["text"])
        if m:
            num, title_rest = m
            # Pfad-Präfix richtet sich nach dem Pattern: § N für juristisch,
            # nackte Nummer für numerische Gliederung. Heuristik: wenn die
            # Original-Zeile mit "§" beginnt → "§", sonst nackt.
            prefix = "§" if blk["text"].lstrip().startswith("§") else ""
            path = f"{prefix} {num}".strip() if prefix else num
            title = f"{path} {title_rest}".strip()
            level = num.count(".") + 1

            # Pop bis Parent-Level < current
            while stack and stack[-1][0] >= level:
                stack.pop()

            # Auto-Create fehlende Zwischen-Parents (z.B. wenn "§ 4.2.1" ohne "§ 4" und "§ 4.2" vorkommt)
            num_parts = num.split(".")
            current_top_level = stack[-1][0]
            for missing_level in range(current_top_level + 1, level):
                missing_num = ".".join(num_parts[:missing_level])
                missing_path = f"§ {missing_num}"
                missing_node: dict[str, Any] = {
                    "id": f"sec_{missing_num.replace('.', '_')}",
                    "title": missing_path,
                    "path": missing_path,
                    "level": missing_level,
                    "content": "",
                    "children": [],
                }
                stack[-1][1]["children"].append(missing_node)
                stack.append((missing_level, missing_node))

            node: dict[str, Any] = {
                "id": f"sec_{num.replace('.', '_')}",
                "title": title,
                "path": path,
                "level": level,
                "content": "",
                "children": [],
            }
            parent = stack[-1][1]
            parent["children"].append(node)
            stack.append((level, node))
        else:
            # Append zum content der aktuellen Top-Node (falls != root)
            top = stack[-1][1] if stack else root
            if top is not root:
                top["content"] = (top["content"] + " " + blk["text"]).strip()
            else:
                # Pre-Heading-Text vor erster Section — als root.content
                root["content"] = (root["content"] + " " + blk["text"]).strip()

    return root


# ─────────────────────────────────────────────────────────────────────
# Claude-basierter Strukturierer (semantischer Pfad)
# ─────────────────────────────────────────────────────────────────────


def extract_page_texts(pdf_path: Path) -> list[str]:
    """Liefert pro Seite einen Volltext-String. OCR-Fallback wenn der
    Text-Layer leer ist (Image-PDF). Gleiche OCR-Settings wie
    `extract_text_blocks`, aber pro-Seite-aggregiert für den
    Claude-Strukturierer."""
    pages: list[str] = []
    pdf = pdfium.PdfDocument(str(pdf_path))
    try:
        for page_idx in range(len(pdf)):
            page = pdf[page_idx]
            tp = page.get_textpage()
            try:
                if tp.count_chars() > 0:
                    text = tp.get_text_range()
                else:
                    bitmap = page.render(scale=2.0)
                    pil_image = bitmap.to_pil()
                    text = pytesseract.image_to_string(pil_image, lang="deu")
            finally:
                tp.close()
            pages.append(text)
    finally:
        pdf.close()
    return pages


_STRUCTURE_SYSTEM_PROMPT = """Du bekommst den OCR-Text einer Förderrichtlinie der \
Stadt Würzburg und strukturierst ihn als sauberen JSON-Tree.

REGELN:
1. Identifiziere TOP-LEVEL-SECTIONS (level 1): "1 Vorwort", "2 Förderrichtlinie und \
Förderbereiche", "3 Verfahren, Verwendungsnachweis, Prüfungsrechte der Stadt Würzburg", \
"4 Schlussbemerkungen", "5 Anlagen und Formulare".
2. Identifiziere UNTER-SECTIONS (level 2/3) im numerischen Format: "2.1 Förderbereich I", \
"3.1 Antragsberechtigt", usw. Section-Nummern wie "3.1" sind KINDER von "3", NIEMALS Top-Level!
3. OCR-Korrekturen die du anwenden musst:
   - "Förderbereich Il" → "Förderbereich II"
   - "Förderbereich Ill" → "Förderbereich III"
   - "$ 71 SGB XII" → "§ 71 SGB XII" (Dollar-Zeichen fälschlich für Paragraph)
   - "SGB X1I" → "SGB XII"
4. Wenn ein Section-Titel mit "-" oder "—" endet, ziehe den Titel über die nächste Zeile \
zusammen. Beispiel: "2.1 Förderbereich I -" gefolgt von "Aufbau von niedrigschwelligen \
Angeboten" wird zu "2.1 Förderbereich I — Aufbau von niedrigschwelligen Angeboten".
5. IGNORIERE komplett (weder Section noch Content):
   - Inhaltsverzeichnis-Einträge (kurze Listen mit Seitenzahlen, meist auf S. 2-3)
   - Bibliografie-/Fußnoten-Einträge ("1 Bundesministerium ... (2025). Neunter Altersbericht...")
   - Wiederkehrende Footer ("Sozialreferat der Stadt Würzburg ... Karmelitenstraße 43, 97070 Würzburg")
   - Reine Seitenzahlen
6. Content einer Section ist der FLIESSTEXT zwischen dem Titel und der nächsten Section. \
Aufzählungen wie "a) ...", "b) ...", "1. ...", "2. ..." gehören IN den Content, NICHT als eigene \
Sections.
7. Output ist EIN einziger JSON-Tree, KEIN Markdown-Wrapping, KEINE Erklärung davor/danach.

ID-SCHEMA:
- root-Knoten: id="root"
- "1 Vorwort": id="sec_1"
- "3.1 Antragsberechtigt": id="sec_3_1"
- "2.4 Förderbereich IV": id="sec_2_4"

PATH-SCHEMA:
- root-Knoten: path=""
- "1 Vorwort": path="1"
- "3.1 Antragsberechtigt": path="3.1"

OUTPUT-SCHEMA (exakt einhalten):
{
  "id": "root",
  "title": "AHP-Förderrichtlinie",
  "path": "",
  "level": 0,
  "content": "",
  "children": [
    {
      "id": "sec_1",
      "title": "1 Vorwort",
      "path": "1",
      "level": 1,
      "content": "Demografischer Wandel...",
      "children": []
    },
    {
      "id": "sec_3",
      "title": "3 Verfahren, Verwendungsnachweis, Prüfungsrechte der Stadt Würzburg",
      "path": "3",
      "level": 1,
      "content": "Für die Antragstellung, Bewilligung und Auszahlung...",
      "children": [
        {
          "id": "sec_3_1",
          "title": "3.1 Antragsberechtigt",
          "path": "3.1",
          "level": 2,
          "content": "sind Verbände, Gruppen und Initiativen...",
          "children": []
        }
      ]
    }
  ]
}

Beginne deine Antwort DIREKT mit dem öffnenden { — kein Markdown-Block, kein Vorwort."""


# Tool-Definition für die strukturierte Tree-Übergabe. Felder werden DIREKT
# als Tool-Input erwartet (nicht in nested `tree`-Objekt verpackt) — sonst
# umgeht Claude die Schema-Validierung und liefert {tree: "<json-string>"}.
_SUBMIT_TREE_TOOL = {
    "name": "submit_doctree",
    "description": (
        "Übergibt den strukturierten Doctree-Root-Knoten der AHP-"
        "Förderrichtlinie. Die Tree-Felder sind flach als Tool-Input — die "
        "rekursive Struktur entsteht über das `children`-Array."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "id": {"type": "string", "description": 'Stable-ID, root="root"'},
            "title": {"type": "string", "description": "Anzeige-Titel der Section"},
            "path": {
                "type": "string",
                "description": 'Breadcrumb-Path (leer bei root, z.B. "3.1")',
            },
            "level": {
                "type": "integer",
                "description": "0=root, 1=Top-Level (1 Vorwort), 2=Unterabschnitt (3.1)",
            },
            "content": {
                "type": "string",
                "description": "Fließtext der Section (ohne Kinder)",
            },
            "children": {
                "type": "array",
                "description": (
                    "Liste der Unter-Sections. Jedes Element hat die "
                    "gleiche Struktur {id, title, path, level, content, children}."
                ),
                "items": {"type": "object"},
            },
        },
        "required": ["id", "title", "path", "level", "content", "children"],
    },
}


async def structure_with_claude(
    pages: list[str],
    model: str = "claude-sonnet-4-5",
    api_key: str | None = None,
) -> dict[str, Any]:
    """Strukturiert OCR-Volltexte einer Förderrichtlinie via Claude in einen
    sauberen hierarchischen Tree.

    Nutzt Anthropic Tool-Use mit `submit_doctree`-Tool, damit der Response
    garantiert wohlgeformtes JSON ist — sonst zerbricht das Parsing an
    unescaped Anführungszeichen im OCR-Volltext.

    Args:
        pages: Liste der OCR-Volltexte pro Seite (Output von `extract_page_texts`).
        model: Anthropic-Modell. Default `claude-sonnet-4-5`.
        api_key: Override; default `ANTHROPIC_API_KEY` aus Environment.

    Returns:
        Tree-Dict im Standard-Schema (id/title/path/level/content/children).

    Raises:
        RuntimeError: Wenn Claude das Tool nicht aufruft.
        anthropic-Exceptions bei API-Fehlern.
    """
    full_text = "\n\n=== SEITENGRENZE ===\n\n".join(
        f"--- Seite {i + 1} ---\n{p}" for i, p in enumerate(pages)
    )
    client = AsyncAnthropic(api_key=api_key or os.environ["ANTHROPIC_API_KEY"])
    response = await client.messages.create(
        model=model,
        max_tokens=16000,
        system=_STRUCTURE_SYSTEM_PROMPT + (
            "\n\nWICHTIG: Rufe das Tool `submit_doctree` mit dem Tree-JSON auf. "
            "Schreibe keinen Text in die Antwort, nur den Tool-Call."
        ),
        tools=[_SUBMIT_TREE_TOOL],
        tool_choice={"type": "tool", "name": "submit_doctree"},
        messages=[{"role": "user", "content": full_text}],
    )
    for block in response.content:
        if getattr(block, "type", "") == "tool_use" and block.name == "submit_doctree":
            # block.input enthält bereits die Tree-Felder flach (id, title, …)
            tree = block.input
            # Defensiv: falls Claude entgegen Schema ein {tree: ...} eingeschachtelt
            # hat, entpacken; falls als String — parsen
            if "tree" in tree and isinstance(tree["tree"], (dict, str)):
                t = tree["tree"]
                tree = json.loads(t) if isinstance(t, str) else t
            return _normalize_tree(tree)
    raise RuntimeError(
        f"Claude hat `submit_doctree` nicht aufgerufen. stop_reason={response.stop_reason}"
    )


def _normalize_tree(node: Any) -> dict[str, Any]:
    """Normalisiert Claude-Output: macht aus JSON-Strings echte Listen/Dicts.

    Anthropic Tool-Use validiert das input_schema nur shallow — verschachtelte
    Listen mit `items: object` werden gelegentlich als JSON-String geliefert.
    Diese Funktion entrollt rekursiv alle solchen Strings."""
    if isinstance(node, str):
        node = json.loads(node)
    if not isinstance(node, dict):
        return node
    children = node.get("children", [])
    if isinstance(children, str):
        children = json.loads(children)
    node["children"] = [_normalize_tree(c) for c in (children or [])]
    return node
