/**
 * FB-spezifische Render-Blöcke für die Antrags-Detailseite.
 *
 * Vier kleine read-only-Komponenten, eine pro Förderbereich. Werden
 * vom AntragDetail-Dispatcher anhand `antrag.foerderbereich` ausgewählt.
 *
 * Bewusst minimal — wir zeigen nur Felder, die für die Sachbearbeitung
 * relevant sind und ohne weitere Joins direkt aus der jeweiligen
 * Detail-Tabelle kommen.
 */
import type {
  FbIProjekt,
  FbIiEhrenamt,
  FbIiHelfer,
  FbIiiVarianteRow,
  FbIvFreitext,
} from "@dv/data-layer";
import { formatEuro } from "../lib/format";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[12rem_1fr] gap-3 py-1.5 border-b border-slate-100 last:border-0">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm text-slate-900">{children}</div>
    </div>
  );
}

export function FbIBlock({ data }: { data: FbIProjekt | null | undefined }) {
  if (!data) return <Placeholder fb="I" />;
  return (
    <div>
      <Row label="Projekttitel">{data.projekt_titel}</Row>
      {data.laufzeit && <Row label="Laufzeit">{data.laufzeit}</Row>}
      {data.stadtteil && <Row label="Stadtteil">{data.stadtteil}</Row>}
      <Row label="Personalkosten">
        {data.personalkosten_euro != null ? formatEuro(data.personalkosten_euro) : "—"}
      </Row>
      <Row label="Sachkosten">
        {data.sachkosten_euro != null ? formatEuro(data.sachkosten_euro) : "—"}
      </Row>
      <Row label="Gesamtkosten">
        <strong>
          {formatEuro((data.personalkosten_euro ?? 0) + (data.sachkosten_euro ?? 0))}
        </strong>
      </Row>
    </div>
  );
}

export function FbIiBlock({
  data,
  helfer,
}: {
  data: FbIiEhrenamt | null | undefined;
  helfer: FbIiHelfer[] | undefined;
}) {
  if (!data) return <Placeholder fb="II" />;
  return (
    <div className="space-y-4">
      <div>
        <Row label="Ehrenamt-Titel">{data.ehrenamt_titel}</Row>
        <Row label="Helfer im Vorjahr">{data.anzahl_helfer_vorjahr ?? "—"}</Row>
        <Row label="Helferstunden gesamt">{data.gesamt_helferstunden_vorjahr ?? "—"}</Row>
        <Row label="Direkter Kontakt zu Senioren">
          {data.direkter_kontakt_senioren ? "ja" : "nein"}
        </Row>
      </div>
      {helfer && helfer.length > 0 && (
        <div>
          <h4 className="text-xs uppercase tracking-wide text-slate-500 mb-2">
            Helfer-Liste ({helfer.length})
          </h4>
          <table className="w-full text-xs border border-slate-200 rounded">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-2 py-1">Pos</th>
                <th className="text-left px-2 py-1">Name</th>
                <th className="text-left px-2 py-1">Vorname</th>
                <th className="text-left px-2 py-1">Einsatz</th>
                <th className="text-right px-2 py-1">Std./Monat</th>
                <th className="text-right px-2 py-1">Std./Jahr</th>
              </tr>
            </thead>
            <tbody>
              {helfer.map((h) => (
                <tr key={h.id} className="border-t border-slate-100">
                  <td className="px-2 py-1 tabular-nums">{h.position}</td>
                  <td className="px-2 py-1">{h.name}</td>
                  <td className="px-2 py-1">{h.vorname}</td>
                  <td className="px-2 py-1 text-slate-600">{h.einsatzbereich ?? "—"}</td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {h.stunden_monat ?? "—"}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {h.stunden_jahr ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function FbIiiBlock({ data }: { data: FbIiiVarianteRow | null | undefined }) {
  if (!data) return <Placeholder fb="III" />;
  return (
    <div>
      <Row label="Variante">
        <strong>{data.variante}</strong>
      </Row>
      {data.variante === "A" && data.a_anmerkung && (
        <Row label="Anmerkung">{data.a_anmerkung}</Row>
      )}
      {data.variante === "B" && (
        <>
          <Row label="Anzahl Veranstaltungen">{data.b_anzahl_veranstaltungen ?? "—"}</Row>
          <Row label="Teilnehmer Senioren">{data.b_teilnehmer_senioren ?? "—"}</Row>
          <Row label="Teilnehmer generationenübergreifend">
            {data.b_teilnehmer_generationen ?? "—"}
          </Row>
          <Row label="Stadtbewohner-Anteil">
            {data.b_stadtbewohner_anteil != null
              ? `${(data.b_stadtbewohner_anteil * 100).toFixed(0)} %`
              : "—"}
          </Row>
          <Row label="Quartierstreffen-Teilnahme">
            {data.b_quartierstreffen_teilnahme ? "ja" : "nein"}
          </Row>
        </>
      )}
      {data.variante === "C" && (
        <>
          <Row label="Treffen-Schwelle">{data.c_treffen_schwelle ?? "—"}</Row>
          <Row label="Teilnehmer Ø">{data.c_teilnehmer_durchschnitt ?? "—"}</Row>
          <Row label="Quartierstreffen-Anzahl">
            {data.c_quartierstreffen_anzahl ?? "—"}
          </Row>
          <Row label="Quartier-Kooperation">
            {data.c_quartier_kooperation ?? "—"}
          </Row>
        </>
      )}
      {data.variante === "D" && (
        <>
          <Row label="Hauptamt-Name">{data.d_hauptamt_name ?? "—"}</Row>
          <Row label="Stunden/Woche">{data.d_hauptamt_stunden_woche ?? "—"}</Row>
          <Row label="Stunden/Monat">{data.d_hauptamt_stunden_monat ?? "—"}</Row>
        </>
      )}
    </div>
  );
}

export function FbIvBlock({ data }: { data: FbIvFreitext | null | undefined }) {
  if (!data) return <Placeholder fb="IV" />;
  return (
    <div>
      <Row label="Vorhaben-Titel">{data.vorhaben_titel}</Row>
      <Row label="Beantragte Summe">
        {data.beantragte_summe_euro != null
          ? formatEuro(data.beantragte_summe_euro)
          : "—"}
      </Row>
      {data.laufzeit && <Row label="Laufzeit">{data.laufzeit}</Row>}
      <Row label="Kurzbeschreibung">
        <p className="whitespace-pre-wrap text-sm">{data.kurzbeschreibung}</p>
      </Row>
      <Row label="Geplante Maßnahmen">
        <p className="whitespace-pre-wrap text-sm">{data.geplante_massnahmen}</p>
      </Row>
    </div>
  );
}

function Placeholder({ fb }: { fb: string }) {
  return (
    <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
      Für FB {fb} liegt noch kein Detail-Datensatz vor (Tabelle leer).
    </div>
  );
}
