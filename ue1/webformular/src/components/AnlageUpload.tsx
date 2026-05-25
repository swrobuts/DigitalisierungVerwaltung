// Drag-and-Drop-Upload-Slot. MIME + Size werden client-seitig validiert.
// Die Datei bleibt im Browser-Memory (state.anlagen[i].file) bis zum
// Phase-3-Submit, dann lädt submit-antrag-Edge-Function alles hoch.

import { useState, type DragEvent } from "react";
import type { AnlagenSlot } from "@dv/foerderbereiche";
import { useAntrag, type AnlageEntry } from "../state/AntragContext";
import { t } from "../lib/i18n";

interface Props { slot: AnlagenSlot; }

export function AnlageUpload({ slot }: Props): JSX.Element {
  const { state, setState } = useAntrag();
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const eintrag = state.anlagen.find((a) => a.anlagentyp === slot.typ);

  function handleFile(file: File) {
    setError(null);
    if (!slot.mime.includes(file.type)) {
      setError(`Dateityp nicht erlaubt (erwartet: ${slot.mime.join(", ")})`);
      return;
    }
    const maxBytes = slot.max_mb * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(`Datei zu groß (max. ${slot.max_mb} MB)`);
      return;
    }
    const entry: AnlageEntry = {
      anlagentyp: slot.typ,
      dateiname: file.name,
      groesse_bytes: file.size,
      file,
    };
    setState((s) => ({
      ...s,
      anlagen: [...s.anlagen.filter((a) => a.anlagentyp !== slot.typ), entry],
    }));
  }

  function onDrop(ev: DragEvent<HTMLDivElement>) {
    ev.preventDefault(); setDragOver(false);
    const f = ev.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }
  function onDragOver(ev: DragEvent<HTMLDivElement>) {
    ev.preventDefault(); setDragOver(true);
  }

  function remove() {
    setState((s) => ({ ...s, anlagen: s.anlagen.filter((a) => a.anlagentyp !== slot.typ) }));
  }

  const klassen = ["anlage-slot",
    slot.pflicht ? "pflicht" : "",
    eintrag ? "uploaded" : "",
    dragOver ? "drag-over" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={klassen} onDrop={onDrop} onDragOver={onDragOver}
         onDragLeave={() => setDragOver(false)}>
      <div className="anlage-titel">
        {slot.beschreibung} {slot.pflicht
          ? <span className="pflicht">({t("anlagen.pflicht")})</span>
          : <span style={{ color: "var(--wuerzburg-muted)" }}>({t("anlagen.optional")})</span>}
      </div>
      <div className="anlage-desc">
        Erlaubt: {slot.mime.join(", ")} · max. {slot.max_mb} MB
      </div>
      {eintrag ? (
        <div>
          <strong>{eintrag.dateiname}</strong> ({Math.round(eintrag.groesse_bytes / 1024)} KB)
          <button type="button" className="btn btn-secondary btn-mini" style={{ marginLeft: "1rem" }}
                  onClick={remove}>
            {t("anlagen.entfernen")}
          </button>
        </div>
      ) : (
        <label style={{ cursor: "pointer", display: "block" }}>
          <input type="file" accept={slot.mime.join(",")}
                 style={{ display: "none" }}
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          <span className="btn btn-secondary btn-mini">{t("anlagen.datei_waehlen")}</span>
        </label>
      )}
      {error && <div className="fehlermeldung">{error}</div>}
    </div>
  );
}
