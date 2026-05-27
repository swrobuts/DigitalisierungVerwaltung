import type { AntragDraft, FoerderbereichId } from "../lib/types";

interface Props {
  draft: AntragDraft;
}

const FB_LABEL: Record<FoerderbereichId, string> = {
  I: "Aufbau niedrigschwelliger Angebote",
  II: "Pauschale Förderung Ehrenamt",
  III: "Treffpunkt / Begegnung / Quartier",
  IV: "Struktur- und Schwerpunktförderung",
};

const FB_VARIANTE_LABEL: Record<string, string> = {
  A: "Mehrgenerationenhaus",
  B: "Begegnungszentrum",
  C: "Seniorenkreis",
  D: "Quartiersmanagement",
};

const ANTRAGSTELLER_FELDER: Array<{
  key: keyof NonNullable<AntragDraft["antragsteller"]>;
  label: string;
}> = [
  { key: "einrichtung", label: "Einrichtung" },
  { key: "ansprechpartner", label: "Ansprechpartner:in" },
  { key: "strasse", label: "Straße" },
  { key: "plz", label: "PLZ" },
  { key: "ort", label: "Ort" },
  { key: "telefon", label: "Telefon" },
  { key: "email", label: "E-Mail" },
  { key: "bankname", label: "Bank" },
  { key: "iban", label: "IBAN" },
  { key: "bic", label: "BIC" },
  { key: "haushaltsjahr", label: "Haushaltsjahr" },
];

/**
 * Sidebar: Card-basiertes Layout wie in UE2/UE3 — Antrags-Vorschau live,
 * dann Status, dann Hinweise, dann Namensfindungs-Fußnote.
 */
export function AntragVorschau({ draft }: Props) {
  const fb = draft.foerderbereich;
  const fbLabel = fb ? FB_LABEL[fb] : null;
  const variante = draft.fb_iii_variante;

  const antragsteller = draft.antragsteller ?? {};
  const ausgefuellt = ANTRAGSTELLER_FELDER.filter(
    (f) => antragsteller[f.key] && String(antragsteller[f.key]).trim() !== "",
  );
  const fehlend = ANTRAGSTELLER_FELDER.filter(
    (f) => !antragsteller[f.key] || String(antragsteller[f.key]).trim() === "",
  );

  const isSubmitted = draft.status === "submitted" || !!draft.antragsnummer;

  return (
    <aside
      data-testid="antrag-vorschau"
      className="w-96 shrink-0 border-l border-slate-200 bg-slate-50 overflow-y-auto"
    >
      <div className="p-4 space-y-3">
        {/* Förderbereich */}
        <Card title="Förderbereich">
          {fb ? (
            <div data-testid="fb-display" className="space-y-0.5">
              <div className="font-semibold text-slate-900 text-[15px]">
                FB {fb}
                {variante && fb === "III" ? ` · Variante ${variante}` : ""}
              </div>
              <div className="text-sm text-slate-600">{fbLabel}</div>
              {variante && fb === "III" && (
                <div className="text-xs text-slate-500">
                  {FB_VARIANTE_LABEL[variante]}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-slate-400 italic">
              Noch nicht erkannt — beschreiben Sie kurz Ihr Vorhaben.
            </div>
          )}
        </Card>

        {/* Antragsteller */}
        <Card title="Antragsteller">
          <div className="flex items-baseline justify-between mb-2 text-xs">
            <span className="text-slate-500 tabular-nums">
              {ausgefuellt.length} von {ANTRAGSTELLER_FELDER.length} Pflichtfeldern
            </span>
            <span className="text-slate-400 tabular-nums">
              {Math.round(
                (ausgefuellt.length / ANTRAGSTELLER_FELDER.length) * 100,
              )} %
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mb-3">
            <div
              data-testid="progress-bar"
              className="bg-wue-rot h-1.5 rounded-full transition-all"
              style={{
                width: `${(ausgefuellt.length / ANTRAGSTELLER_FELDER.length) * 100}%`,
              }}
            />
          </div>
          <dl className="space-y-1.5 text-sm">
            {ausgefuellt.map((f) => (
              <div key={f.key} className="flex justify-between gap-2">
                <dt className="text-slate-500 shrink-0">{f.label}</dt>
                <dd
                  className="text-slate-800 text-right truncate"
                  title={String(antragsteller[f.key])}
                >
                  {String(antragsteller[f.key])}
                </dd>
              </div>
            ))}
            {fehlend.length > 0 && (
              <details className="text-xs text-slate-400 mt-2">
                <summary className="cursor-pointer hover:text-slate-600">
                  {fehlend.length} Felder offen
                </summary>
                <ul className="mt-1 pl-3 list-disc space-y-0.5">
                  {fehlend.map((f) => (
                    <li key={f.key}>{f.label}</li>
                  ))}
                </ul>
              </details>
            )}
          </dl>
        </Card>

        {/* Submit-Status */}
        {isSubmitted && draft.antragsnummer && (
          <div
            data-testid="submitted-card"
            className="bg-emerald-50 border border-emerald-200 rounded-lg p-4"
          >
            <div className="text-xs font-semibold text-emerald-700 uppercase mb-1">
              Antrag eingereicht
            </div>
            <div className="font-mono text-sm text-emerald-900 break-all">
              {draft.antragsnummer}
            </div>
            <div className="text-xs text-emerald-700 mt-2">
              Die Sachbearbeitung meldet sich innerhalb von ca. 4 Wochen.
            </div>
          </div>
        )}

        {/* Reifegrad-Hinweis */}
        <Card title="Reifegrad-Hinweis" tone="warn">
          <p className="text-xs text-slate-600 leading-snug">
            Dieser Assistent zitiert keine § und nennt keine
            Förderhöhen. Beides steht im rechtssicheren Bescheid der
            Sachbearbeitung.
          </p>
        </Card>

        {/* Namens-Fußnote */}
        <details className="text-[11px] text-slate-400">
          <summary className="cursor-pointer hover:text-slate-600">
            Warum heißt der Assistent „CIVA"?
          </summary>
          <p className="mt-2 leading-snug">
            CIVA leitet sich vom lateinischen <em>civitas</em> (Bürgerschaft,
            Gemeinwesen) ab. Wir haben bewusst einen Kunstnamen gewählt
            und keinen menschlichen Vornamen, weil ein menschlicher Name
            (z.B. „Anna") suggerieren würde, hier interagiere ein Mensch
            mit Ihnen. Tatsächlich antwortet ein KI-System (Claude Sonnet
            4.5 von Anthropic) — diese Transparenz ist nach EU AI Act
            Art. 50 verpflichtend.
          </p>
        </details>
      </div>
    </aside>
  );
}

/** Wiederverwendbare Card im Stil von UE2/UE3 — weißer Hintergrund, dezenter
 *  Rahmen, kleine Überschrift. Optional warn-Tone für gelben Hinweis. */
function Card({
  title,
  tone = "neutral",
  children,
}: {
  title: string;
  tone?: "neutral" | "warn";
  children: React.ReactNode;
}) {
  const palette =
    tone === "warn"
      ? "bg-amber-50 border-amber-200"
      : "bg-white border-slate-200";
  return (
    <div className={`border rounded-lg p-4 ${palette}`}>
      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
        {title}
      </div>
      {children}
    </div>
  );
}
