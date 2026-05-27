import { CheckCircle2, MessagesSquare, Sparkles, FileText } from "lucide-react";
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
 * Sidebar: progressiv. Im Empty-State zeigt sie ein dezentes
 * Onboarding ("So funktioniert CIVA — 3 Schritte"). Sobald der Dialog
 * etwas produziert (Förderbereich erkannt oder erste Antragsteller-
 * Felder erfasst), erscheinen die jeweiligen Cards — nicht früher,
 * damit der Bürger nicht von leeren Karten irritiert wird.
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
  const hatDaten = !!fb || ausgefuellt.length > 0 || isSubmitted;

  // Onboarding-Modus: leerer Draft → reduzierte Sidebar mit
  // 3-Schritte-Erklärung statt leerer Cards.
  if (!hatDaten) {
    return (
      <aside
        data-testid="antrag-vorschau"
        className="w-80 shrink-0 border-l border-slate-200 bg-slate-50/60 overflow-y-auto"
      >
        <div className="p-5 space-y-4">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            So funktioniert CIVA
          </div>
          <OnboardingStep
            n={1}
            icon={MessagesSquare}
            title="Vorhaben beschreiben"
            text="Erzählen Sie mit Ihren Worten, was Sie planen — ein Begegnungszentrum, eine Pauschale fürs Ehrenamt, ein Quartiersprojekt."
          />
          <OnboardingStep
            n={2}
            icon={Sparkles}
            title="Förderbereich finden"
            text="CIVA ordnet Ihr Vorhaben dem passenden Förderbereich zu und fragt nur die wirklich nötigen Angaben ab."
          />
          <OnboardingStep
            n={3}
            icon={FileText}
            title="Antrag übernehmen"
            text="Am Ende übergibt CIVA Ihre Angaben an das städtische Webformular — Sie prüfen und reichen ein."
          />
          <div className="pt-2 mt-2 border-t border-slate-200/70 text-[11px] text-slate-500 leading-snug">
            <span className="font-semibold text-slate-600">Tipp:</span> Sie
            können Belege direkt im Chat anhängen (PDF, JPG, Excel) — CIVA
            erkennt typische Antragsanlagen automatisch.
          </div>
        </div>
      </aside>
    );
  }

  // Daten-Modus: progressives Card-Layout
  return (
    <aside
      data-testid="antrag-vorschau"
      className="w-96 shrink-0 border-l border-slate-200 bg-slate-50 overflow-y-auto"
    >
      <div className="p-4 space-y-3">
        {/* Förderbereich — nur wenn erkannt */}
        {fb && (
          <Card title="Förderbereich" icon={Sparkles}>
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
          </Card>
        )}

        {/* Antragsteller — nur wenn min. 1 Feld erfasst */}
        {ausgefuellt.length > 0 && (
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
        )}

        {/* Submit-Status — nur nach Einreichung */}
        {isSubmitted && draft.antragsnummer && (
          <div
            data-testid="submitted-card"
            className="bg-emerald-50 border border-emerald-200 rounded-xl p-4"
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 uppercase mb-1">
              <CheckCircle2 className="w-4 h-4" />
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

        {/* Reifegrad-Hinweis bleibt immer sichtbar, sobald irgendwas
            erfasst ist — als ehrlicher Disclaimer. */}
        <Card title="Reifegrad-Hinweis" tone="warn">
          <p className="text-xs text-slate-600 leading-snug">
            Dieser Assistent zitiert keine § und nennt keine
            Förderhöhen. Beides steht im rechtssicheren Bescheid der
            Sachbearbeitung.
          </p>
        </Card>
      </div>
    </aside>
  );
}

/** Onboarding-Schritt im Empty-State — Zahl + Lucide-Icon + kurze Erklärung. */
function OnboardingStep({
  n,
  icon: Icon,
  title,
  text,
}: {
  n: number;
  icon: typeof Sparkles;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-wue-rot">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-800 flex items-baseline gap-1.5">
          <span className="tabular-nums text-slate-400 text-xs">{n}.</span>
          {title}
        </div>
        <div className="text-xs text-slate-500 leading-snug mt-0.5">{text}</div>
      </div>
    </div>
  );
}

/** Card im UE2/UE3-Stil. Optionales Icon links neben dem Titel. */
function Card({
  title,
  tone = "neutral",
  icon: Icon,
  children,
}: {
  title: string;
  tone?: "neutral" | "warn";
  icon?: typeof Sparkles;
  children: React.ReactNode;
}) {
  const palette =
    tone === "warn"
      ? "bg-amber-50 border-amber-200"
      : "bg-white border-slate-200";
  return (
    <div className={`border rounded-xl p-4 ${palette}`}>
      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {title}
      </div>
      {children}
    </div>
  );
}
