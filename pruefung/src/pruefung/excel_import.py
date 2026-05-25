"""Excel-Schablonen-Import — Helferliste (FB II) oder Belegaufstellung (alle FBs).

openpyxl-basiert, deterministisch, KEIN LLM nötig. Die Schablone hat
einen festen Header — passt der nicht, gibt's einen ValueError mit klarer
Diagnostik. So vermeidet sich der Bürger CSV-Parsing-Albträume und wir
haben einen sauberen Pfad in apl.fb_ii_helfer ohne OCR-Risiko.
"""
from __future__ import annotations

from io import BytesIO
from typing import Any

import openpyxl


SCHABLONE_HELFERLISTE_HEADERS: list[str] = [
    "Position", "Name", "Vorname", "Einsatzbereich",
    "Eintritt", "Austritt", "Stunden/Monat", "Stunden/Jahr",
]


def _coerce_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _coerce_date_str(v: Any) -> str | None:
    """Excel-Datum oder String → ISO-YYYY-MM-DD oder None."""
    if v is None or v == "":
        return None
    if hasattr(v, "isoformat"):
        return v.isoformat()[:10]
    return str(v)[:10]


def import_helferliste(xlsx_bytes: bytes) -> list[dict[str, Any]]:
    """Liest eine Helferliste-Schablone (.xlsx) und returnt Dict-Liste.

    Raises:
        ValueError: Wenn die ersten N Header-Spalten nicht der Schablone
            entsprechen (sauberer Fehler statt halb-importierter Daten).
    """
    wb = openpyxl.load_workbook(BytesIO(xlsx_bytes), read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []

    headers = [str(c or "").strip() for c in rows[0]]
    if headers[:len(SCHABLONE_HELFERLISTE_HEADERS)] != SCHABLONE_HELFERLISTE_HEADERS:
        raise ValueError(
            f"Schablonen-Mismatch — erwartet {SCHABLONE_HELFERLISTE_HEADERS}, "
            f"fand {headers[:len(SCHABLONE_HELFERLISTE_HEADERS)]}",
        )

    out: list[dict[str, Any]] = []
    for i, row in enumerate(rows[1:], start=1):
        # Defensiv: kurze Zeilen mit None auffüllen
        row = list(row) + [None] * (8 - len(row))
        name = (row[1] or "").strip() if isinstance(row[1], str) else ""
        vorname = (row[2] or "").strip() if isinstance(row[2], str) else ""
        if not name or not vorname:
            continue
        try:
            position = int(row[0]) if row[0] is not None else i
        except (TypeError, ValueError):
            position = i
        out.append({
            "position": position,
            "name": name,
            "vorname": vorname,
            "einsatzbereich": (row[3] or None) if row[3] else None,
            "eintritt": _coerce_date_str(row[4]),
            "austritt": _coerce_date_str(row[5]),
            "stunden_monat": _coerce_float(row[6]),
            "stunden_jahr": _coerce_float(row[7]),
        })
    return out
