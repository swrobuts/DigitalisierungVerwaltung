"""PDF → Doc-Tree (PageIndex-Stil).

Heuristik: Heading-Erkennung über Pattern `§ N(.M)*` zur Pfad-Konstruktion.
Liefert hierarchischen Tree mit stable IDs, Path-Breadcrumb und Content je Section.

Tree-Schema:
{
  id: str,           # stable, z.B. "sec_4_2_1" oder "root"
  title: str,        # "§ 4.2.1 Mietkosten" oder synth root
  path: str,         # "§ 4.2.1" — Breadcrumb (leer bei root)
  level: int,        # 0=root, 1=§N, 2=§N.M, 3=§N.M.K, …
  content: str,      # Plain-Text der Section (ohne Kinder), accumulated
  children: list[<same>],
}
"""
import re
from pathlib import Path
from typing import Any

import pypdfium2 as pdfium
import pytesseract

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
