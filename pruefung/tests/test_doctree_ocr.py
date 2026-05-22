"""Tests für OCR-Fallback in doctree_build.

Wir mocken pytesseract (kein echter Tesseract-Call im Test) und prüfen
nur dass der Fallback-Pfad richtig getriggert wird wenn count_chars == 0.
"""
from unittest.mock import patch, MagicMock
import pytest
from pathlib import Path
from pruefung.doctree_build import extract_text_blocks


def test_ocr_fallback_triggert_wenn_text_layer_leer(tmp_path, monkeypatch):
    """Wenn pypdfium2 keinen Text findet, soll pytesseract.image_to_string
    auf einer gerenderten Bitmap aufgerufen werden."""

    # Mock pypdfium2 page mit count_chars=0 + Bitmap-Render
    fake_page = MagicMock()
    fake_textpage = MagicMock()
    fake_textpage.count_chars.return_value = 0
    fake_textpage.get_text_range.return_value = ""
    fake_page.get_textpage.return_value = fake_textpage
    fake_bitmap = MagicMock()
    fake_pil_image = MagicMock()
    fake_bitmap.to_pil.return_value = fake_pil_image
    fake_page.render.return_value = fake_bitmap

    fake_pdf = MagicMock()
    fake_pdf.__len__ = lambda self: 1
    fake_pdf.__getitem__ = lambda self, i: fake_page

    with patch("pruefung.doctree_build.pdfium.PdfDocument", return_value=fake_pdf), \
         patch("pruefung.doctree_build.pytesseract.image_to_string", return_value="§ 1 Geltungsbereich\nDie Richtlinie regelt..."):
        blocks = extract_text_blocks(Path("/fake/path.pdf"))

    # 2 Zeilen: Heading + Content
    assert len(blocks) == 2
    assert blocks[0]["text"].startswith("§ 1")
    assert "Richtlinie regelt" in blocks[1]["text"]


def test_kein_ocr_wenn_text_layer_vorhanden(tmp_path):
    """Bei text-PDFs darf OCR NICHT laufen (würde Performance kosten)."""
    fake_page = MagicMock()
    fake_textpage = MagicMock()
    fake_textpage.count_chars.return_value = 100
    fake_textpage.get_text_range.return_value = "§ 1 Test\nInhalt der Section."
    fake_page.get_textpage.return_value = fake_textpage

    fake_pdf = MagicMock()
    fake_pdf.__len__ = lambda self: 1
    fake_pdf.__getitem__ = lambda self, i: fake_page

    with patch("pruefung.doctree_build.pdfium.PdfDocument", return_value=fake_pdf), \
         patch("pruefung.doctree_build.pytesseract.image_to_string") as mock_ocr:
        blocks = extract_text_blocks(Path("/fake/path.pdf"))

    mock_ocr.assert_not_called()
    assert len(blocks) == 2
