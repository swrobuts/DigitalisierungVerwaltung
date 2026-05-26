# UE3-Vollrestoration — Final-Bericht (2026-05-26)

## Was war kaputt
Beim Multi-FB-Hard-Cut (commit c3fc01b, apl2 → apl Schema-Umzug) wurden gelöscht:
- **6 UE3-Components** (3782 LOC): PruefungsCard, BescheideListe, AntragMetricsBar, VorjahresVergleich, ZweitpruefungsCard, ExterneValidierungCard
- **5 Hooks** (~600 LOC): usePruefung, usePruefungen, useAhpTree, useVergleichVorjahr, useExterneValidierung
- **4 DB-Tabellen vergessen**: apl.pruefprotokoll, apl.pruefungen, apl.ahp_doctree, apl.ahp_plaene
- **Halluzinations-Verstoß**: FB IV als „strukturiertes Formular mit Pflichtfeldern" (Stadt Würzburg sagt: „FB IV: Formlos")
- **Ontologie-Lücke**: ahp_norm_statements für FB I, II, IV nicht kuratiert

## Was wir wiederhergestellt haben (8 Etappen, 24 Commits)

| Etappe | Inhalt | Commits | Tests |
|---|---|---|---|
| A (vorbereitet) | Migrationen 070+071 + PDF-Audit | 15e4a45 | — |
| B | 5 UE3-Hooks | 7cf3bd8, eacc786, c9de0fc, 8a3c72e, b2054ca | +6 |
| C | 5 Core-Components | 584fb23, 033b345, b014a0f, 4a1343f, c4b0e04 | +10 |
| D | AntragDetail-Layout | f953083 | +1 |
| E | ZweitpruefungsCard + ExterneValidierungCard | d812bce, 104be1d | +7 |
| F | FB-IV als formloser Antrag (UE1 + Renderer + Backend) | 31a87bf, 8f03dab, cf3db6f | (siehe Workspaces) |
| G | Migration 072 (Ontologie) + agent_chat/tools FB-IV | 29d32fb, c1289fd | — |
| H | Tests + Builds + Deploy-Anleitung | 8a9aec3 | — |

**Total:** 24 Commits + 67/67 UE3-Tests grün + alle 5 Frontends bauen sauber.

## Was passieren muss, damit es live geht
Siehe `docs/lehrveranstaltung/2026-05-26-ue3-vollrestoration-deploy.md`.

Kurz:
1. Migrationen 070+071+072 auf VPS einspielen
2. UE2 + UE3 Container `docker compose build --no-cache` + restart
3. pruefung-service Backend rebuild (FB-IV-Validator + agent_chat)
4. (optional) UE1 rebuild für FB-IV-PDF-Upload
5. Browser-Smoketest: KI-Konformitäts-Prüfung muss jetzt Hinweise + Empfehlung anzeigen, Bescheide haben PDF/DOCX-Download

## Bewusste Auslassungen (für Folge-Iteration)
- **FB-IV-Storage-Edge-Function**: PDF landet aktuell als `anlage` (Standard-Pfad), nicht direkt in `fb_iv_freitext.dokument_path`. Saubere Lösung in eigener Etappe.
- **Doctree-Build**: `apl.ahp_doctree` ist nach Migration 070 leer; Backend `check_rag()` fängt das ab. Build mit `python -m pruefung.scripts.build_doctree` bei Bedarf.
- **Voyage-Embeddings**: nicht aktualisiert (nur für Wortlaut-Popover, ältere Embeddings noch nutzbar).
- **`useBekannteBearbeiter`-Hook** (ZweitpruefungsCard): nicht restauriert; Inline-Fallback ohne Vorschläge funktioniert.

## Halluzinations-Stand
Alle FB-IV-erfundenen Felder (`geplante_massnahmen`, `beantragte_summe_euro`, `laufzeit`) wurden aus UE1-Formular, Renderer-Schema, Backend-Validator und UE4-Agent-Prompts entfernt. Die DB-Spalten bleiben als nullable Legacy-Spalten erhalten (Migration 071 — kein DROP, damit bestehende Demo-Anträge nicht crashen). Source-of-Truth ist jetzt nachweisbar nur die PDFs in `materialien/wuerzburg-2026/` + die Stadt-Würzburg-Website.
