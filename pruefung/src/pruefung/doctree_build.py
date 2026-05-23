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
from pruefung.llm_client import get_llm_client

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
Stadt Würzburg und gibst sie als sauber strukturiertes Markdown zurück.

REGELN:
1. Top-Level-Sections als `# heading` (genau ein #):
   - "# 1 Vorwort"
   - "# 2 Förderrichtlinie und Förderbereiche"
   - "# 3 Verfahren, Verwendungsnachweis, Prüfungsrechte der Stadt Würzburg"
   - "# 4 Schlussbemerkungen"
   - "# 5 Anlagen und Formulare"
2. Unter-Sections im numerischen Format als `## heading` (zwei ##):
   - "## 2.1 Förderbereich I — Aufbau von niedrigschwelligen Angeboten"
   - "## 3.1 Antragsberechtigt"
3. Sub-Sub-Sections als `### heading` (drei ###).
4. OCR-Korrekturen anwenden:
   - "Förderbereich Il" → "Förderbereich II"
   - "Förderbereich Ill" → "Förderbereich III"
   - "$ 71 SGB XII" → "§ 71 SGB XII"
   - "SGB X1I" → "SGB XII"
5. Wenn ein Section-Titel mit "-" oder "—" endet, ziehe den Titel über die \
nächste Zeile zusammen.
6. IGNORIERE komplett:
   - Inhaltsverzeichnis-Einträge (kurze Listen mit Seitenzahlen, meist S. 2-3)
   - Bibliografie-/Fußnoten-Einträge ("1 Bundesministerium ... (2025) ...")
   - Wiederkehrende Footer ("Sozialreferat ... Karmelitenstraße 43, 97070 Würzburg")
   - Reine Seitenzahlen
7. Content einer Section: Fließtext zwischen Heading und nächstem Heading. \
Aufzählungen wie "a) ...", "b) ...", "1. ...", "2. ..." bleiben IM Fließtext stehen \
(NICHT als eigene Headings ausgeben).
8. Output: pures Markdown, kein Code-Block-Wrapping (```), keine Erklärung davor/danach.

BEISPIEL:

# 1 Vorwort

Demografischer Wandel und seine Herausforderungen für Würzburg

Der demografische Wandel stellt die Kommunen ... (voller Fließtext)

# 3 Verfahren, Verwendungsnachweis, Prüfungsrechte der Stadt Würzburg

Für die Antragstellung, Bewilligung und Auszahlung der Zuschüsse und für die \
Zuschussrichtlinien gelten im Einzelnen folgende Regelungen:

## 3.1 Antragsberechtigt

sind Verbände, Gruppen und Initiativen der Seniorenarbeit ...

## 3.2 Antragstellung

a) Die Anträge sind auf den entsprechenden Formblättern fristgerecht ...
b) Voraussetzungen für die Bearbeitung ...

Beginne deine Antwort DIREKT mit der ersten `#`-Überschrift."""


async def structure_with_claude(
    pages: list[str],
    model: str = "claude-sonnet-4-5",
    api_key: str | None = None,
) -> dict[str, Any]:
    """Strukturiert OCR-Volltexte einer Förderrichtlinie via Claude in einen
    sauberen hierarchischen Tree.

    Pipeline: Claude liefert Markdown (`#`/`##`/`###`-Headings) zurück,
    wir parsen das robust in den Standard-Tree. Markdown ist robust gegen
    unescaped Quotes im Section-Content — Tool-Use mit nested JSON-Arrays
    zerbrach hier wiederholt.

    Args:
        pages: Liste der OCR-Volltexte pro Seite (Output von `extract_page_texts`).
        model: Anthropic-Modell. Default `claude-sonnet-4-5`.
        api_key: Override; default `ANTHROPIC_API_KEY` aus Environment.

    Returns:
        Tree-Dict im Standard-Schema (id/title/path/level/content/children).
    """
    full_text = "\n\n=== SEITENGRENZE ===\n\n".join(
        f"--- Seite {i + 1} ---\n{p}" for i, p in enumerate(pages)
    )
    # api_key wird via env (ANTHROPIC_API_KEY) gelesen — der Parameter
    # bleibt aus Backwards-Compat in der Signatur, wird aber nicht mehr
    # durchgereicht (Provider-Abstraktion liest env zentral)
    _ = api_key
    client = get_llm_client(default_model=model)
    response = await client.complete(
        system=_STRUCTURE_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": full_text}],
        max_tokens=16000,
        model=model,
    )
    markdown = "".join(
        block.text for block in response.content if getattr(block, "type", "") == "text"
    ).strip()
    # Defensiv: Falls Claude doch ein Code-Block-Wrapping benutzt, abstreifen
    if markdown.startswith("```"):
        markdown = markdown.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    return md_to_tree(markdown)


_MD_HEADING_RE = re.compile(r"^(#{1,4})\s+(.+?)\s*$")
_MD_PATH_RE = re.compile(r"^([\d]+(?:\.[\d]+)*)\s+")


def md_to_tree(markdown: str) -> dict[str, Any]:
    """Parst Markdown mit `#`/`##`/`###`-Headings in den Standard-Tree.

    Heading-Tiefe → `level`. Aus dem Heading-Text wird die `path`-Nummer
    extrahiert (z.B. `## 3.1 Antragsberechtigt` → path=`3.1`, level=2).
    Sektionen ohne erkennbare Nummerierung bekommen leere `path` und eine
    fallback-ID auf Basis der Position.

    Args:
        markdown: Markdown-String, idealerweise von `structure_with_claude`.
    """
    root: dict[str, Any] = {
        "id": "root",
        "title": "AHP-Förderrichtlinie",
        "path": "",
        "level": 0,
        "content": "",
        "children": [],
    }
    # Stack: (heading_level, node) — heading_level entspricht der Anzahl #'s
    stack: list[tuple[int, dict[str, Any]]] = [(0, root)]
    fallback_idx = 0

    for line in markdown.splitlines():
        m = _MD_HEADING_RE.match(line)
        if m:
            heading_level = len(m.group(1))
            title = m.group(2).strip()
            pm = _MD_PATH_RE.match(title)
            if pm:
                path = pm.group(1).rstrip(".")
                sec_id = "sec_" + path.replace(".", "_")
            else:
                fallback_idx += 1
                path = ""
                sec_id = f"sec_unnamed_{fallback_idx}"

            node: dict[str, Any] = {
                "id": sec_id,
                "title": title,
                "path": path,
                "level": heading_level,
                "content": "",
                "children": [],
            }
            while stack and stack[-1][0] >= heading_level:
                stack.pop()
            (stack[-1] if stack else (0, root))[1]["children"].append(node)
            stack.append((heading_level, node))
        else:
            text = line.strip()
            if not text:
                continue
            top = stack[-1][1] if stack else root
            top["content"] = (top["content"] + " " + text).strip()

    return root
