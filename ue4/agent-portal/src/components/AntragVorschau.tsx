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

const ANTRAGSTELLER_FELDER: Array<{ key: keyof NonNullable<AntragDraft["antragsteller"]>; label: string }> = [
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
 * Sidebar: zeigt den aktuellen Antrags-Draft live. Niemals halluzinierte
 * FBs anzeigen — die agent-api.ts hat den Draft bereits gefiltert.
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
      className="w-80 shrink-0 border-l border-slate-200 bg-white overflow-y-auto"
    >
      <div className="p-4 border-b border-slate-200 bg-wue-rot-soft">
        <div className="text-xs font-semibold tracking-wider text-wue-rot uppercase">
          Antrags-Vorschau
        </div>
        <div className="text-sm text-slate-600 mt-0.5">
          Live-Stand Ihres Antrags
        </div>
      </div>

      {/* Förderbereich */}
      <section className="p-4 border-b border-slate-100">
        <div className="text-xs font-semibold text-slate-500 uppercase mb-1.5">
          Förderbereich
        </div>
        {fb ? (
          <div data-testid="fb-display">
            <div className="font-semibold text-wue-grau text-[15px]">
              FB {fb}
              {variante && fb === "III" ? ` · Variante ${variante}` : ""}
            </div>
            <div className="text-sm text-slate-600">{fbLabel}</div>
            {variante && fb === "III" && (
              <div className="text-xs text-slate-500 mt-0.5">
                {FB_VARIANTE_LABEL[variante]}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-slate-400 italic">
            Noch nicht erkannt — beschreiben Sie kurz Ihr Vorhaben.
          </div>
        )}
      </section>

      {/* Antragsteller */}
      <section className="p-4 border-b border-slate-100">
        <div className="text-xs font-semibold text-slate-500 uppercase mb-1.5">
          Antragsteller
        </div>
        <div className="text-xs text-slate-500 mb-2">
          {ausgefuellt.length} von {ANTRAGSTELLER_FELDER.length} Pflichtfeldern
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
              <dd className="text-slate-800 text-right truncate" title={String(antragsteller[f.key])}>
                {String(antragsteller[f.key])}
              </dd>
            </div>
          ))}
          {fehlend.length > 0 && (
            <details className="text-xs text-slate-400 mt-2">
              <summary className="cursor-pointer">
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
      </section>

      {/* Submit-Status */}
      {isSubmitted && draft.antragsnummer && (
        <section
          data-testid="submitted-card"
          className="p-4 m-4 rounded-lg bg-emerald-50 border border-emerald-200"
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
        </section>
      )}

      {/* Footer-Hinweis */}
      <div className="p-4 text-[11px] text-slate-400 leading-snug">
        <strong className="text-wue-rot/70">Hinweis (UE4 — Reifegrad 4):</strong>{" "}
        Dieser Assistent zitiert keine § und nennt keine Förderhöhen.
        Beides steht im rechtssicheren Bescheid.
      </div>
    </aside>
  );
}
