/**
 * UE3 Smart-Upload — Bearbeiter zieht 1-N PDFs in die Drop-Zone, Backend
 * klassifiziert pro PDF (FB I/II/III/IV + ggf. Variante + Konfidenz +
 * Begründung). Bearbeiter kann „Übernehmen" / „Korrigieren" pro PDF.
 *
 * „Übernehmen" legt ein apl.antrag_einreichung-Row mit erkanntem FB an
 * (Status `wartend`). Der weitere Pipeline-Lauf (Extraktion) übernimmt
 * UE0 — wir setzen hier nur den Anker.
 *
 * Für FB II steht zusätzlich ein „Helferliste extrahieren"-Knopf bereit,
 * der /api/extrahiere-helferliste benutzt und das Resultat anzeigt.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FileUp, Loader2, Check } from "lucide-react";
import { ALL_FOERDERBEREICHE, type FoerderbereichId } from "@dv/foerderbereiche";
import { getSupabase } from "@dv/data-layer";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { FbIcon } from "../components/FbIcon";

const ENDPOINT = "https://pruefung.butscher.cloud/api/klassifiziere-pdf";
const HELFER_ENDPOINT = "https://pruefung.butscher.cloud/api/extrahiere-helferliste";

interface KlassifikationResult {
  fb: FoerderbereichId | null;
  variante: "A" | "B" | "C" | "D" | null;
  konfidenz: number;
  begruendung: string;
}

interface UploadItem {
  id: string;
  file: File;
  status: "wartend" | "klassifiziere" | "fertig" | "fehler" | "uebernommen";
  klassifikation: KlassifikationResult | null;
  fehler: string | null;
  helferliste?: Array<Record<string, unknown>>;
  korrigierter_fb?: FoerderbereichId;
}

function newId() {
  return crypto.randomUUID();
}

export function SmartUpload() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);

  async function classifyOne(item: UploadItem) {
    setItems((arr) =>
      arr.map((i) => (i.id === item.id ? { ...i, status: "klassifiziere" } : i)),
    );
    try {
      const fd = new FormData();
      fd.append("file", item.file);
      const res = await fetch(ENDPOINT, { method: "POST", body: fd });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
      const data = (await res.json()) as KlassifikationResult;
      setItems((arr) =>
        arr.map((i) =>
          i.id === item.id
            ? { ...i, status: "fertig", klassifikation: data }
            : i,
        ),
      );
    } catch (e) {
      setItems((arr) =>
        arr.map((i) =>
          i.id === item.id
            ? { ...i, status: "fehler", fehler: (e as Error).message }
            : i,
        ),
      );
    }
  }

  function handleFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type === "application/pdf");
    const newItems: UploadItem[] = list.map((f) => ({
      id: newId(),
      file: f,
      status: "wartend",
      klassifikation: null,
      fehler: null,
    }));
    setItems((arr) => [...arr, ...newItems]);
    // klassifiziere parallel
    for (const i of newItems) void classifyOne(i);
  }

  async function uebernehmen(item: UploadItem) {
    const fb = item.korrigierter_fb ?? item.klassifikation?.fb;
    if (!fb) return;
    try {
      const sb = getSupabase();
      const path = `smart-upload/${item.id}/${item.file.name}`;
      const { error: upErr } = await sb.storage
        .from("antragseingang-pdf")
        .upload(path, item.file);
      if (upErr) throw upErr;
      const { error: insErr } = await sb.from("antrag_einreichung").insert({
        storage_path: path,
        dateiname: item.file.name,
        groesse_bytes: item.file.size,
        erkannter_fb: fb,
        status: "wartend",
      });
      if (insErr) throw insErr;
      setItems((arr) =>
        arr.map((i) => (i.id === item.id ? { ...i, status: "uebernommen" } : i)),
      );
    } catch (e) {
      setItems((arr) =>
        arr.map((i) =>
          i.id === item.id ? { ...i, fehler: (e as Error).message } : i,
        ),
      );
    }
  }

  async function extractHelfer(item: UploadItem) {
    try {
      const fd = new FormData();
      fd.append("file", item.file);
      const res = await fetch(HELFER_ENDPOINT, { method: "POST", body: fd });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { helfer: Array<Record<string, unknown>> };
      setItems((arr) =>
        arr.map((i) => (i.id === item.id ? { ...i, helferliste: data.helfer } : i)),
      );
    } catch (e) {
      setItems((arr) =>
        arr.map((i) =>
          i.id === item.id ? { ...i, fehler: (e as Error).message } : i,
        ),
      );
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 relative">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-wue-rot" />
        <div className="w-full px-4 py-3 flex items-center gap-3">
          <Link
            to="/inbox"
            className="text-sm text-slate-500 flex items-center gap-1 hover:text-wue-rot"
          >
            <ArrowLeft className="h-4 w-4" /> Inbox
          </Link>
          <span className="text-slate-300">·</span>
          <h1 className="text-xl font-bold">Smart Upload (KI-Klassifikation)</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={
            "border-2 border-dashed rounded-lg p-12 text-center transition-colors " +
            (dragOver
              ? "border-emerald-500 bg-emerald-50"
              : "border-slate-300 bg-white")
          }
        >
          <FileUp className="h-10 w-10 text-slate-400 mx-auto mb-3" />
          <p className="text-sm text-slate-700">
            PDFs hier ablegen oder{" "}
            <label className="text-emerald-700 underline cursor-pointer">
              auswählen
              <input
                type="file"
                multiple
                accept="application/pdf"
                className="hidden"
                onChange={(e) => e.target.files && handleFiles(e.target.files)}
              />
            </label>
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Backend erkennt FB automatisch (Claude Vision). Bearbeiter kann korrigieren.
          </p>
        </div>

        <div className="space-y-3">
          {items.map((item) => (
            <UploadCard
              key={item.id}
              item={item}
              onAccept={() => uebernehmen(item)}
              onExtractHelfer={() => extractHelfer(item)}
              onCorrect={(fb) =>
                setItems((arr) =>
                  arr.map((i) => (i.id === item.id ? { ...i, korrigierter_fb: fb } : i)),
                )
              }
            />
          ))}
          {items.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-6">
              Noch keine Dateien hochgeladen.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function UploadCard({
  item,
  onAccept,
  onExtractHelfer,
  onCorrect,
}: {
  item: UploadItem;
  onAccept: () => void;
  onExtractHelfer: () => void;
  onCorrect: (fb: FoerderbereichId) => void;
}) {
  const fb = item.korrigierter_fb ?? item.klassifikation?.fb ?? null;
  const cfg = fb ? ALL_FOERDERBEREICHE[fb] : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-mono">{item.file.name}</CardTitle>
        <span className="text-xs text-slate-500">
          {(item.file.size / 1024 / 1024).toFixed(2)} MB
        </span>
      </CardHeader>
      <CardContent>
        {item.status === "klassifiziere" && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Klassifiziere via Claude Vision …
          </div>
        )}
        {item.status === "fehler" && (
          <div className="text-sm text-rose-700">Fehler: {item.fehler}</div>
        )}
        {item.status === "uebernommen" && (
          <div className="text-sm text-emerald-700 flex items-center gap-2">
            <Check className="h-4 w-4" /> Übernommen — apl.antrag_einreichung angelegt.
          </div>
        )}
        {item.status === "fertig" && item.klassifikation && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs uppercase text-slate-500">Erkannt:</span>
              {cfg ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-emerald-300 bg-emerald-50 text-emerald-900 text-sm font-medium">
                  <FbIcon name={cfg.icon} className="h-3.5 w-3.5" />
                  FB {fb} · {cfg.label_kurz}
                </span>
              ) : (
                <span className="text-sm text-amber-700">
                  Unbekannt — bitte korrigieren.
                </span>
              )}
              {item.klassifikation.variante && (
                <span className="text-xs text-slate-700">
                  Variante <strong>{item.klassifikation.variante}</strong>
                </span>
              )}
              <span className="text-xs text-slate-600">
                Konfidenz{" "}
                <strong className={item.klassifikation.konfidenz < 0.5 ? "text-amber-700" : ""}>
                  {(item.klassifikation.konfidenz * 100).toFixed(0)} %
                </strong>
              </span>
            </div>
            {item.klassifikation.begruendung && (
              <p className="text-xs text-slate-600 italic">
                „{item.klassifikation.begruendung}"
              </p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" onClick={onAccept}>
                <Check className="h-3 w-3" /> Übernehmen
              </Button>
              <details className="text-xs">
                <summary className="cursor-pointer text-slate-600 hover:text-slate-900">
                  Korrigieren
                </summary>
                <div className="mt-1.5 flex gap-1 flex-wrap">
                  {(["I", "II", "III", "IV"] as FoerderbereichId[]).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => onCorrect(opt)}
                      className={
                        "px-2 py-0.5 rounded border text-xs " +
                        (opt === fb
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-white border-slate-300 hover:border-slate-500")
                      }
                    >
                      FB {opt} · {ALL_FOERDERBEREICHE[opt].label_kurz}
                    </button>
                  ))}
                </div>
              </details>
              {fb === "II" && (
                <Button variant="outline" size="sm" onClick={onExtractHelfer}>
                  Helferliste extrahieren
                </Button>
              )}
            </div>
            {item.helferliste && (
              <div className="text-xs border border-slate-200 rounded p-2 bg-slate-50">
                <div className="font-medium mb-1">
                  Helferliste-Vorschau ({item.helferliste.length})
                </div>
                <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                  {item.helferliste.slice(0, 10).map((h, i) => (
                    <li key={i} className="font-mono">
                      {String(h.name ?? "—")}, {String(h.vorname ?? "—")} —{" "}
                      {String(h.einsatzbereich ?? "—")}
                    </li>
                  ))}
                  {item.helferliste.length > 10 && (
                    <li className="text-slate-500">
                      … +{item.helferliste.length - 10} weitere
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

