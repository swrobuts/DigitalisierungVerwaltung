// 1:n-Editor für apl.fb_ii_helfer. Inline-Tabelle mit +/- Buttons.

import { useAntrag, type HelferRow } from "../state/AntragContext";
import { t } from "../lib/i18n";

const LEERE_ZEILE: HelferRow = { name: "", vorname: "", einsatzbereich: "", eintritt: "", stunden_jahr: "" };

export function HelferTabelle(): JSX.Element {
  const { state, setState } = useAntrag();

  function patchHelfer(idx: number, patch: Partial<HelferRow>) {
    setState((s) => {
      const list = [...s.fb_ii.helfer];
      const cur = list[idx];
      if (!cur) return s;
      list[idx] = { ...cur, ...patch };
      return { ...s, fb_ii: { ...s.fb_ii, helfer: list } };
    });
  }

  function add() {
    setState((s) => ({ ...s, fb_ii: { ...s.fb_ii, helfer: [...s.fb_ii.helfer, { ...LEERE_ZEILE }] } }));
  }

  function remove(idx: number) {
    setState((s) => ({ ...s, fb_ii: { ...s.fb_ii, helfer: s.fb_ii.helfer.filter((_, i) => i !== idx) } }));
  }

  return (
    <div>
      <table className="helfer-tabelle">
        <thead>
          <tr>
            <th>{t("fb2.helfer.name")}</th>
            <th>{t("fb2.helfer.vorname")}</th>
            <th>{t("fb2.helfer.einsatz")}</th>
            <th>{t("fb2.helfer.eintritt")}</th>
            <th>{t("fb2.helfer.stunden_jahr")}</th>
            <th className="col-remove"></th>
          </tr>
        </thead>
        <tbody>
          {state.fb_ii.helfer.length === 0 && (
            <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--wuerzburg-muted)" }}>
              Noch keine Helfer:innen erfasst.
            </td></tr>
          )}
          {state.fb_ii.helfer.map((h, idx) => (
            <tr key={idx}>
              <td><input type="text" value={h.name}
                         onChange={(e) => patchHelfer(idx, { name: e.target.value })} /></td>
              <td><input type="text" value={h.vorname}
                         onChange={(e) => patchHelfer(idx, { vorname: e.target.value })} /></td>
              <td><input type="text" value={h.einsatzbereich}
                         onChange={(e) => patchHelfer(idx, { einsatzbereich: e.target.value })} /></td>
              <td><input type="date" value={h.eintritt}
                         onChange={(e) => patchHelfer(idx, { eintritt: e.target.value })} /></td>
              <td><input type="number" min="0" step="0.5" value={h.stunden_jahr}
                         onChange={(e) => patchHelfer(idx, { stunden_jahr: e.target.value })} /></td>
              <td className="col-remove">
                <button type="button" className="btn btn-secondary btn-mini" onClick={() => remove(idx)}>
                  {t("fb2.helfer.entfernen")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn btn-secondary btn-mini" style={{ marginTop: ".5rem" }} onClick={add}>
        {t("fb2.helfer.add")}
      </button>
    </div>
  );
}
