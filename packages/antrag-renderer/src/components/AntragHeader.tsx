/**
 * AntragHeader — Stadt-Würzburg-Banner + Förder-Hero + Einrichtungs-Block
 * + Summary-Strip mit beantragter Förderung.
 *
 * Wiederherstellung des Pre-Hard-Cut-Looks (Commit 7754322, 23.05.2026).
 *
 * Architektur:
 *   - `antrag` (Multi-FB-Schema, type `Antrag` aus @dv/data-layer)
 *   - FB-spezifische Detail-Records (`fbI`, `fbIii`, `fbIv`) optional —
 *     der Summary-Strip rechnet daraus den passenden Förder-Betrag aus.
 *   - Status-Badge + Aktenzeichen rechts.
 *
 * Halluzinations-Schutz: Felder werden ausschließlich aus dem
 * Multi-FB-Schema (apl) gelesen. KEIN Zugriff auf apl2-Legacy-Felder
 * (`antrag.name`, `antrag.traeger`, `antrag.bankverbindung`,
 * `antrag.antragsdatum`, `geforderte_foerdersumme_euro`). Wo das Schema
 * keinen Betrag liefert, wird ein FB-spezifischer Hinweis (z.B. „Pauschal
 * (nach Helferstunden)") gerendert — nichts erfunden.
 */
import type {
  Antrag,
  FbIProjekt,
  FbIiiVarianteRow,
  FbIvFreitext,
  FoerderbereichId,
  StatusEnum,
} from "@dv/data-layer";
import { formatEuro } from "../format";

interface Props {
  antrag: Pick<
    Antrag,
    | "antragsnummer"
    | "haushaltsjahr"
    | "foerderbereich"
    | "status"
    | "submitted_at"
    | "einrichtung"
    | "dachverband"
    | "strasse"
    | "hausnummer"
    | "plz"
    | "ort"
  >;
  fbI?: FbIProjekt | null;
  fbIii?: FbIiiVarianteRow | null;
  fbIv?: FbIvFreitext | null;
  /**
   * Optionales Status-Badge-Slot — UE2/UE3 reichen ihre eigene
   * StatusBadge-Komponente rein (die ist app-spezifisch, weil sie
   * Routing-/Theme-Detail enthalten kann).
   */
  statusBadge?: import("react").ReactNode;
}

// FB-spezifische Hero-Titel (laut Antrags-Auftrag) ──────────────────────
const FB_TITEL: Record<FoerderbereichId, string> = {
  I: "Aufbau niedrigschwelliger Angebote",
  II: "Förderung bürgerschaftlichen Engagements",
  III: "Förderung bewährter Strukturen",
  IV: "Struktur- und Schwerpunktförderung",
};

const FB_AHP_PFAD: Record<FoerderbereichId, string> = {
  I: "AHP 2.1",
  II: "AHP 2.2",
  III: "AHP 2.3",
  IV: "AHP 2.4",
};

const STATUS_DE: Record<StatusEnum, string> = {
  eingegangen: "Eingegangen",
  in_pruefung: "In Prüfung",
  rueckfrage: "Rückfrage",
  bewilligt: "Bewilligt",
  abgelehnt: "Abgelehnt",
};

export function AntragHeader({
  antrag,
  fbI,
  fbIii,
  fbIv,
  statusBadge,
}: Props) {
  const heroTitel = FB_TITEL[antrag.foerderbereich];

  return (
    <>
      {/* Briefkopf — klassischer Verwaltungs-Stil:
          dünne Wü-Rot-Akzentlinie oben + Behördenname in dezent-
          gedämpftem Stadt-Würzburg-Rot auf Weiß. Wirkt offiziell ohne
          aufdringlich zu sein (Vergleich klassische Stadt-Briefköpfe). */}
      <div className="border-t-[3px] border-wue-rot bg-white px-10 lg:px-14 py-2 flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-semibold tracking-[0.18em] text-[12px] text-wue-rot">
          STADT WÜRZBURG
        </div>
        <div className="text-[11px] text-slate-500 tracking-wide">
          Sozialreferat · Beratungsstelle für Senioren
        </div>
      </div>

      {/* Titelblock */}
      <div className="px-10 lg:px-14 pt-8 pb-7 border-b border-slate-200">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="text-[10.5px] uppercase tracking-[0.18em] text-slate-500 font-medium">
              Förderantrag · Altentagesstätten APL 2
            </div>
            <div
              className="text-[10px] text-slate-400 italic mt-0.5 leading-snug max-w-[60ch]"
              title="APL 2 ist nur das Aktenzeichen — geltende Rechtsgrundlage ist die AHP-Förderrichtlinie der Stadt Würzburg (Stand 2025-03-27)."
            >
              Aktenzeichen — Rechtsgrundlage: AHP-Förderrichtlinie Stadt Würzburg (Stand 2025-03-27)
            </div>
            <h1 className="text-lg font-semibold text-slate-800 mt-1.5 leading-snug">
              {heroTitel}
            </h1>
            <p className="text-[11px] text-slate-500 mt-1">
              Haushaltsjahr{" "}
              <span className="font-semibold text-slate-800 tabular-nums">
                {antrag.haushaltsjahr}
              </span>
              <span className="mx-2 text-slate-300">·</span>
              Würzburg,{" "}
              <span className="text-slate-800">{formatDateTimeShort(antrag.submitted_at)}</span>
              <span
                className="text-[10.5px] text-slate-400 italic ml-1"
                title="Zeitstempel der elektronischen Einreichung. Eingangsdatum im System siehe Footer."
              >
                (Eingangsdatum)
              </span>
            </p>
          </div>
          <div className="text-right shrink-0 text-xs">
            <div className="text-[10.5px] uppercase tracking-wider text-slate-500">
              Aktenzeichen
            </div>
            <div className="font-mono text-[13px] font-semibold text-slate-900 mt-0.5">
              {antrag.antragsnummer ?? "—"}
            </div>
            <div className="mt-1.5">
              {statusBadge ?? <FallbackStatusBadge status={antrag.status} />}
            </div>
          </div>
        </div>

        {/* Einrichtungs-Block — DAS ist der visuelle Anker */}
        <div className="mt-5 border-l-[3px] border-wue-rot pl-4">
          <div className="text-[10.5px] uppercase tracking-wider text-slate-500 font-medium">
            Einrichtung
          </div>
          <div className="text-[18px] font-bold text-slate-900 mt-0.5 leading-tight">
            {antrag.einrichtung}
          </div>
          {antrag.dachverband && (
            <div className="text-[13px] text-slate-700 mt-0.5">{antrag.dachverband}</div>
          )}
          <div className="text-[13px] text-slate-600 mt-0.5">
            {formatAdresse(antrag)}
          </div>
        </div>

        {/* Beantragte Förderung — Summary-Strip */}
        <AntragSummaryStrip
          antrag={antrag}
          fbI={fbI}
          fbIii={fbIii}
          fbIv={fbIv}
        />
      </div>
    </>
  );
}

/** Förder-Summary-Strip pro Förderbereich. Felder werden NUR aus dem
 * Multi-FB-Schema gelesen — wo das Schema keinen konkreten Betrag
 * vorsieht, wird ein semantischer Platzhalter angezeigt (kein erfundener
 * Wert).
 */
function AntragSummaryStrip({
  antrag,
  fbI,
  fbIii,
  fbIv,
}: {
  antrag: Pick<Antrag, "foerderbereich">;
  fbI?: FbIProjekt | null;
  fbIii?: FbIiiVarianteRow | null;
  fbIv?: FbIvFreitext | null;
}) {
  const summary = summaryFor(antrag.foerderbereich, fbI, fbIii, fbIv);

  return (
    <div className="mt-5 grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 border rounded-sm px-4 py-3 bg-slate-50 border-slate-200">
      <div>
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-slate-500 font-medium">
          Beantragte Förderung (Jahr)
        </div>
        <div className="text-2xl font-bold tabular-nums leading-tight mt-0.5 text-slate-900">
          {summary.betrag}
        </div>
      </div>
      <div className="sm:border-l sm:border-slate-300 sm:pl-4 flex flex-col justify-center">
        <div className="text-[13px] text-slate-700">
          <span className="font-medium">
            FB {antrag.foerderbereich} — {FB_TITEL[antrag.foerderbereich]}
          </span>
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5">
          {FB_AHP_PFAD[antrag.foerderbereich]} · {summary.subtext}
        </div>
      </div>
    </div>
  );
}

interface SummaryFields {
  /** Angezeigter Betrag — formatierter String oder Klartext-Platzhalter. */
  betrag: string;
  /** Untertext mit Bezug zur AHP-Förderhöchstgrenze. */
  subtext: string;
}

function summaryFor(
  fb: FoerderbereichId,
  fbI?: FbIProjekt | null,
  fbIii?: FbIiiVarianteRow | null,
  fbIv?: FbIvFreitext | null,
): SummaryFields {
  switch (fb) {
    case "I": {
      const summe = (fbI?.personalkosten_euro ?? 0) + (fbI?.sachkosten_euro ?? 0);
      if (summe === 0) {
        return {
          betrag: "—",
          subtext: "Personalkosten + Sachkosten (Aufbauphase, AHP 2.1) — Felder noch nicht erfasst",
        };
      }
      return {
        betrag: formatEuro(summe),
        subtext: "Personalkosten + Sachkosten (Aufbauphase, AHP 2.1)",
      };
    }
    case "II":
      return {
        betrag: "Pauschal",
        subtext: "Pauschalförderung nach Helferstunden (AHP 2.2 — keine fixe Höhe im Schema)",
      };
    case "III": {
      const variante = fbIii?.variante;
      if (!variante) {
        return {
          betrag: "—",
          subtext: "Variante noch nicht zugeordnet (AHP 2.3)",
        };
      }
      const map: Record<NonNullable<typeof variante>, SummaryFields> = {
        A: {
          betrag: "bis 800 €",
          subtext: "Variante A · Mehrgenerationenhaus (AHP 2.3 Pkt. 1) — Förderhöchstgrenze",
        },
        B: {
          betrag: "bis 1.200 €",
          subtext: "Variante B · Begegnungszentrum/Bildungsträger (AHP 2.3 Pkt. 2/3) — Förderhöchstgrenze",
        },
        C: {
          betrag:
            fbIii?.c_treffen_schwelle === "GT_20" || fbIii?.c_treffen_schwelle === "GT_40"
              ? "bis 750 €"
              : "bis 600 €",
          subtext: `Variante C · Seniorenkreis (AHP 2.3 Pkt. 4) — ${fbIii?.c_treffen_schwelle === "GT_20" || fbIii?.c_treffen_schwelle === "GT_40" ? "Treffen-Staffel ab 20+/Jahr" : "Treffen-Staffel ab 10+/Jahr"}`,
        },
        D: {
          betrag: "bis 2.400 €",
          subtext: "Variante D · Quartiersmanagement (AHP 2.3 Pkt. 5) — Förderhöchstgrenze",
        },
      };
      return map[variante];
    }
    case "IV": {
      const wert = fbIv?.beantragte_summe_euro;
      if (wert != null && wert > 0) {
        return {
          betrag: formatEuro(wert),
          subtext: "Struktur- & Schwerpunktförderung (AHP 2.4) — formlose Beantragung",
        };
      }
      return {
        betrag: "Höhe gem. formlosem Antrag",
        subtext: "Struktur- & Schwerpunktförderung (AHP 2.4) — Einzelfall-Bewilligung",
      };
    }
  }
}

function FallbackStatusBadge({ status }: { status: StatusEnum }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-300">
      {STATUS_DE[status]}
    </span>
  );
}

function formatAdresse(
  antrag: Pick<Antrag, "strasse" | "hausnummer" | "plz" | "ort">,
): string {
  const strasseHnr = antrag.hausnummer
    ? `${antrag.strasse} ${antrag.hausnummer}`
    : antrag.strasse;
  return `${strasseHnr}, ${antrag.plz} ${antrag.ort}`;
}

function formatDateTimeShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
