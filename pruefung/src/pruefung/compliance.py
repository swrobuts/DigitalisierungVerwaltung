"""AI-Act- und DSGVO-Compliance-Übersicht.

Stellt strukturiert zusammen, was Pflicht-Inhalte für Hochrisiko-KI-Systeme
nach EU AI Act + DSGVO sind und wie wir sie umgesetzt haben. Die Seite
dient zwei Zwecken:

1. **Selbst-Audit**: Sachbearbeiter:innen + IT können nachprüfen, ob das
   System weiterhin der Konfiguration entspricht (z.B. ob ein neuer
   externer Service hinzugekommen ist, der hier dokumentiert sein müsste).

2. **Externe Transparenz**: Antragsteller:innen, Datenschutzbeauftragte,
   Aufsichtsbehörden können nachvollziehen, welche KI-Eingriffe wo
   passieren und welche Daten wohin gehen.

Wichtig: das ist KEIN Ersatz für die formelle Konformitätsbewertung nach
AI Act Art. 43 oder die DSGVO-Folgenabschätzung — das ist eine
TECHNISCHE Live-Übersicht, die zeigt was das System tatsächlich tut.
Eine formelle Bewertung gehört zur Stelle, die das System betreibt.
"""
from typing import Any
from pruefung.db import SupabaseClient


# ── Statische Konfig: das System selbst beschreiben ───────────────────

SYSTEM_KLASSIFIKATION = {
    "name": "UE3 — KI-gestützte Antragsprüfung APL 2 (Altentagesstätten)",
    "betreiber": "Stadt Würzburg · Sozialreferat",
    "ai_act_risiko_klasse": "Hochrisiko",
    "ai_act_grundlage": (
        "EU AI Act, Anhang III Nr. 5(a) — KI-Systeme zur "
        "Bewertung der Anspruchsberechtigung natürlicher Personen "
        "(bzw. ihrer Träger) auf wesentliche öffentliche "
        "Unterstützungsleistungen."
    ),
    "ai_act_pflichten": [
        "Risk-Management-System (Art. 9)",
        "Daten-Governance + -Qualität (Art. 10)",
        "Technische Dokumentation (Art. 11)",
        "Aufzeichnungspflicht / Logging (Art. 12)",
        "Transparenz für Nutzende (Art. 13)",
        "Menschliche Aufsicht (Art. 14)",
        "Genauigkeit, Robustheit, Cybersicherheit (Art. 15)",
        "Transparenz für betroffene Personen (Art. 50)",
    ],
    "rechtsgrundlage_verarbeitung": (
        "Art. 6 Abs. 1 lit. e DSGVO (öffentliches Interesse / "
        "Ausübung öffentlicher Gewalt) i.V.m. AHP-Förderrichtlinie "
        "der Stadt Würzburg vom 27.03.2025."
    ),
}


# Welche KI-Systeme nutzen wir, wozu, mit welchen Daten?
KI_SYSTEME = [
    {
        "name": "Anthropic Claude (Sonnet 4.5)",
        "rolle": "Erst- und Zweit-Prüfung (Wortlaut-Abgleich gegen AHP)",
        "anbieter": "Anthropic PBC, USA",
        "datenkategorien": ["Antragsdaten (institutionell)", "AHP-Volltext"],
        "personenbezug": "Indirekt (Träger-Vereinsname, Einrichtungs-Adresse) — keine Ansprechpartner-Email/Telefon",
        "verarbeitungsort": "EU-Endpoint wenn konfiguriert; sonst USA",
        "endpoint_envvar": "ANTHROPIC_API_KEY",
        "zweck_ai_act": "Anwendung der Förderrichtlinie auf konkrete Anträge — Hochrisiko",
    },
    {
        "name": "Voyage AI (voyage-3 Embeddings)",
        "rolle": "Semantische Suche im AHP-Volltext (RAG)",
        "anbieter": "Voyage AI Innovations Inc., USA",
        "datenkategorien": ["AHP-Section-Texte"],
        "personenbezug": "Keiner (nur Richtlinientext)",
        "verarbeitungsort": "USA",
        "endpoint_envvar": "VOYAGE_API_KEY",
        "zweck_ai_act": "Hilfssystem zur Volltext-Recherche — kein Entscheidungs-KI",
    },
    {
        "name": "Perplexity Sonar",
        "rolle": "Externe Realitäts-Validierung (Layer D)",
        "anbieter": "Perplexity AI Inc., USA",
        "datenkategorien": ["Trägername", "Einrichtungsname", "Adresse"],
        "personenbezug": "Keiner — Ansprechpartner-Name/Email/Telefon werden bewusst NICHT übertragen (Datenminimierung)",
        "verarbeitungsort": "USA",
        "endpoint_envvar": "PERPLEXITY_API_KEY",
        "zweck_ai_act": "Hilfssystem zur Adress-/Träger-Verifizierung — keine eigene Entscheidung",
    },
]


# Welche externen Services? Was geht wohin?
DATENFLUESSE = [
    {
        "von": "pruefung-service",
        "nach": "Anthropic API (api.anthropic.com)",
        "was": "Antrag-JSON (ohne PII) + AHP-Section-Texte als Tool-Use-Input",
        "wie_oft": "pro Erstprüfung 1× + pro KI-Zweitprüfung 1× + pro Norm-Extraction",
    },
    {
        "von": "pruefung-service",
        "nach": "Voyage AI API (api.voyageai.com)",
        "was": "AHP-Section-Texte für Embedding-Berechnung",
        "wie_oft": "1× pro Doctree-Rebuild (~30 Sections); pro semantischer Suche 1× (Query-Embedding)",
    },
    {
        "von": "pruefung-service",
        "nach": "Perplexity API (api.perplexity.ai)",
        "was": "3 Suchabfragen mit Träger/Adresse/Einrichtung (ohne Ansprechpartner-PII)",
        "wie_oft": "Nur auf manuellen Klick durch Sachbearbeiter:in",
    },
    {
        "von": "Browser Sachbearbeiter:in",
        "nach": "Supabase (supabase.butscher.cloud) — selbst-gehostet",
        "was": "Antragsdaten, Prüfprotokolle, Bescheide",
        "wie_oft": "Bei jedem UI-Interaktion (Read + Write via RLS)",
    },
]


# Menschliche Aufsicht — wo greift der Mensch ein?
MENSCHLICHE_AUFSICHT = [
    {
        "punkt": "Vier-Augen-Prinzip",
        "umsetzung": "Pflicht-Zweitprüfung bei Ablehnungen + Bewilligungen > 5.000 €; manuell zuweisbar an andere Sachbearbeiter:in",
        "ai_act_referenz": "Art. 14 (b) — Eingreifen-Können",
    },
    {
        "punkt": "Finale Entscheidung",
        "umsetzung": "Bescheid wird durch Sachbearbeiter:in ausgestellt; KI liefert nur Empfehlung. Sozialausschuss entscheidet nach AHP 3.4.",
        "ai_act_referenz": "Art. 14 (a) — System ist 'recommendation', nicht 'automated decision'",
    },
    {
        "punkt": "Override-Tracking",
        "umsetzung": "Adoption-Dashboard zeigt Übernahme-Quote KI-Empfehlung vs. finale Entscheidung — Automation-Bias-Sichtbarkeit",
        "ai_act_referenz": "Art. 14 (a) — gegen 'over-reliance'",
    },
    {
        "punkt": "Adversarielle KI-Zweitprüfung",
        "umsetzung": "Eigener Prompt sucht aktiv nach Schwächen der Erstprüfung; Dissens-Highlight im UI",
        "ai_act_referenz": "Art. 15 — Robustheit / Korrektiv",
    },
    {
        "punkt": "Halluzinations-Schutz",
        "umsetzung": "Vor jedem Bescheid wird jeder KI-Befund mit paragraph_ref gegen den AHP-Volltext verifiziert; Bescheid blockiert bei nicht-verifizierbaren Stellen",
        "ai_act_referenz": "Art. 10 / Art. 15 — Datenqualität + Genauigkeit",
    },
]


# Audit-Trail — was wird wo geloggt?
# TODO Phase 4A.2: apl.pruefprotokoll und apl.pruefungen existieren im neuen
# apl-Schema nicht (mehr); ersetzt durch apl.manuelle_pruefung +
# Plugin-spezifische KI-Ergebnis-Persistenz. Die Audit-Liste wird in Phase 4B
# auf die neue Welt umgestellt — vorerst markieren wir die nicht mehr
# vorhandenen Tabellen als deprecated.
AUDIT_TRAIL_QUELLEN = [
    {
        "tabelle": "apl.antrag_history",
        "inhalt": "Alle Antrags-Status-Wechsel mit Zeitstempel, Bearbeiter:in, Kommentar",
        "ai_act_referenz": "Art. 12 — Aufzeichnungspflicht",
    },
    {
        "tabelle": "apl.manuelle_pruefung",
        "inhalt": "Manuelle Sachbearbeiter-Prüfung mit Abhakungen, Kommentar, Entscheidungsvorschlag",
        "ai_act_referenz": "Art. 14 — Nachweis menschlicher Aufsicht",
    },
    {
        "tabelle": "apl.bescheide",
        "inhalt": "Ausgestellte Bescheide mit Begründung, Bearbeiter:in, Stand der Rechtsgrundlage",
        "ai_act_referenz": "Art. 11 — Technische Dokumentation",
    },
    # TODO Phase 4B: Audit-Quelle für KI-Läufe (Erst/Zweit/extern) ergänzen
    # sobald die Persistenz-Tabelle für KI-Befunde im neuen Schema feststeht.
]


DATENMINIMIERUNG = [
    {
        "kontext": "Externe API-Aufrufe (Perplexity)",
        "regel": "Ansprechpartner-Name, Email, Telefon werden NICHT übertragen — nur institutionelle Daten",
        "rechtsgrundlage": "Art. 5 Abs. 1 lit. c DSGVO (Datenminimierung)",
    },
    {
        "kontext": "LLM-Kontext (Claude)",
        "regel": "Antrag-JSON wird mitgegeben — enthält auch Ansprechpartner-Daten. Dies ist für die Prüfung erforderlich (z.B. IBAN-Inhaber-Plausibilität).",
        "rechtsgrundlage": "Art. 6 Abs. 1 lit. e DSGVO + Erforderlichkeit",
    },
    {
        "kontext": "Frontend-Bundle",
        "regel": "Supabase-ANON-KEY ist im Browser-Bundle (public by design); Zugriffsschutz erfolgt über Row-Level-Security in der DB. Service-Role-Key bleibt server-side.",
        "rechtsgrundlage": "Privacy-by-Design",
    },
]


async def berechne_compliance_metriken(db: SupabaseClient) -> dict[str, Any]:
    """Live-Statistiken aus der DB: was hat das System tatsächlich getan?

    TODO Phase 4A.2: pruefprotokoll und pruefungen existieren im neuen apl-
    Schema nicht mehr. Bis zur Anbindung der neuen KI-Persistenz liefert die
    Funktion nur die Bescheide-Zählung; KI-Lauf- und Zweitprüfungs-Metriken
    sind None-platzhalter.
    """
    bescheide = await db.select("bescheide", "select=id")

    return {
        "ki_laeufe_gesamt": None,             # TODO Phase 4B
        "ki_laeufe_extern": None,             # TODO Phase 4B
        "ki_laeufe_adversariell": None,       # TODO Phase 4B
        "bescheide_gesamt": len(bescheide),
        "zweitpruefungen_gesamt": None,       # TODO Phase 4B
        "zweitpruefungen_durch_ki": None,     # TODO Phase 4B
        "llm_token_gesamt": None,             # TODO Phase 4B
        "llm_kosten_usd_geschaetzt": None,    # TODO Phase 4B
        "hinweis": (
            "Live-Metriken für KI-Läufe sind in Phase 4A vorübergehend "
            "deaktiviert (Schema-Refactor apl2→apl). Werden in Phase 4B "
            "auf die neue Persistenz umgestellt."
        ),
    }


async def status(db: SupabaseClient) -> dict[str, Any]:
    """Vollständiger Compliance-Status — statische Konfig + Live-Metriken."""
    from pruefung.llm_client import provider_meta
    metriken = await berechne_compliance_metriken(db)
    aktiver_provider = provider_meta()
    return {
        "system": SYSTEM_KLASSIFIKATION,
        "aktiver_llm_provider": aktiver_provider,
        "ki_systeme": KI_SYSTEME,
        "datenfluesse": DATENFLUESSE,
        "menschliche_aufsicht": MENSCHLICHE_AUFSICHT,
        "audit_trail_quellen": AUDIT_TRAIL_QUELLEN,
        "datenminimierung": DATENMINIMIERUNG,
        "live_metriken": metriken,
        "stand": "Mai 2026 — Vorstand des Sozialreferats, Stadt Würzburg",
        "hinweis": (
            "Diese Übersicht ist eine technische Live-Sicht auf das laufende "
            "System. Sie ersetzt nicht die formelle Konformitätsbewertung "
            "nach AI Act Art. 43 oder die DSGVO-Folgenabschätzung — beides "
            "Aufgabe der betreibenden Stelle."
        ),
    }
