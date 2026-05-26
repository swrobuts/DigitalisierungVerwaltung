// 1:n-Editor für apl.fb_ii_helfer. Inline-Tabelle mit +/- Buttons.
// Spalten exakt nach PDF anlage-ahp-2-helferliste:
//   Name, Vorname, Einsatzbereich, Eintritt, Austritt, Stunden mtl., Stunden jährl.
//
// PDF-Import: Bürger kann eine bestehende Helferliste (PDF, gerne auch
// handschriftlich/gescannt) hochladen. Das pruefung-Backend extrahiert
// die Zeilen via Claude Vision und liefert sie strukturiert zurück.
// Die Zeilen werden zur bestehenden Liste hinzugefügt (nicht überschrieben).

import { useRef, useState } from "react";
import { useAntrag, type HelferRow } from "../state/AntragContext";
import { t } from "../lib/i18n";

const LEERE_ZEILE: HelferRow = {
  name: "", vorname: "", einsatzbereich: "",
  eintritt: "", austritt: "",
  stunden_monat: "", stunden_jahr: "",
};

/** Backend-API-Base — analog zu lib/api.ts oder via Vite-Env. */
const API_BASE: string =
  (import.meta as unknown as { env: Record<string, string> }).env
    .VITE_PRUEFUNG_URL ?? "https://pruefung.butscher.cloud";

interface ExtractedHelfer {
  position?: number;
  name?: string | null;
  vorname?: string | null;
  einsatzbereich?: string | null;
  eintritt?: string | null;
  austritt?: string | null;
  stunden_monat?: number | string | null;
  stunden_jahr?: number | string | null;
}

function num(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  return String(v);
}

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

export function HelferTabelle(): JSX.Element {
  const { state, setState } = useAntrag();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importErr, setImportErr] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

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
    setState((s) => ({
      ...s,
      fb_ii: { ...s.fb_ii, helfer: [...s.fb_ii.helfer, { ...LEERE_ZEILE }] },
    }));
  }

  function remove(idx: number) {
    setState((s) => ({
      ...s,
      fb_ii: { ...s.fb_ii, helfer: s.fb_ii.helfer.filter((_, i) => i !== idx) },
    }));
  }

  async function handleImport(file: File) {
    setImporting(true);
    setImportErr(null);
    setImportMsg(null);
    try {
      const fd = new FormData();
      // Backend-Endpoint /api/extrahiere-helferliste erwartet Field-Name „file"
      fd.append("file", file, file.name);
      const res = await fetch(`${API_BASE}/api/extrahiere-helferliste`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${txt || res.statusText}`);
      }
      const data = (await res.json()) as { helfer?: ExtractedHelfer[] };
      const arr = Array.isArray(data.helfer) ? data.helfer : [];
      if (arr.length === 0) {
        setImportMsg("PDF gelesen — keine Helfer:innen erkannt.");
        return;
      }
      const neu: HelferRow[] = arr
        .filter((h) => str(h.name) || str(h.vorname))  // Halluzinations-Schutz: leere Zeilen verwerfen
        .map((h) => ({
          name: str(h.name),
          vorname: str(h.vorname),
          einsatzbereich: str(h.einsatzbereich),
          eintritt: str(h.eintritt),
          austritt: str(h.austritt),
          stunden_monat: num(h.stunden_monat),
          stunden_jahr: num(h.stunden_jahr),
        }));
      setState((s) => ({
        ...s,
        fb_ii: { ...s.fb_ii, helfer: [...s.fb_ii.helfer, ...neu] },
      }));
      setImportMsg(
        `${neu.length} Helfer:in${neu.length === 1 ? "" : "nen"} aus PDF übernommen.`,
      );
    } catch (e) {
      setImportErr((e as Error).message || "PDF-Import fehlgeschlagen.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div>
      {/* PDF-Import-Knopf — über der Tabelle, klar als KI-Hilfe gekennzeichnet */}
      <div className="helfer-import-zone">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImport(f);
          }}
        />
        <button
          type="button"
          className="btn btn-secondary btn-mini"
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
        >
          {importing ? "PDF wird ausgelesen …" : "📄 Bestehende Helferliste als PDF einlesen (KI)"}
        </button>
        <span className="helfer-import-hint">
          Bestehende Helferliste hochladen — die KI extrahiert die Zeilen
          und fügt sie unten an. Sie können danach jede Zeile prüfen und korrigieren.
        </span>
      </div>
      {importErr && <div className="alert-error" style={{ marginTop: ".5rem" }}>{importErr}</div>}
      {importMsg && <div className="alert-info" style={{ marginTop: ".5rem" }}>{importMsg}</div>}

      <table className="helfer-tabelle">
        <thead>
          <tr>
            <th>{t("fb2.helfer.name")}</th>
            <th>{t("fb2.helfer.vorname")}</th>
            <th>{t("fb2.helfer.einsatz")}</th>
            <th>{t("fb2.helfer.eintritt")}</th>
            <th>{t("fb2.helfer.austritt")}</th>
            <th>{t("fb2.helfer.stunden_monat")}</th>
            <th>{t("fb2.helfer.stunden_jahr")}</th>
            <th className="col-remove"></th>
          </tr>
        </thead>
        <tbody>
          {state.fb_ii.helfer.length === 0 && (
            <tr>
              <td colSpan={8} style={{ textAlign: "center", color: "var(--wuerzburg-muted)" }}>
                Noch keine Helfer:innen erfasst.
              </td>
            </tr>
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
              <td><input type="date" value={h.austritt}
                         onChange={(e) => patchHelfer(idx, { austritt: e.target.value })} /></td>
              <td><input type="number" min="0" step="0.5" value={h.stunden_monat}
                         onChange={(e) => patchHelfer(idx, { stunden_monat: e.target.value })} /></td>
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
