import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "./ui/button";
import { supabase } from "../lib/supabase";
import type { Anlage } from "@dv/data-layer";

const TYP_LABELS: Record<string, string> = {
  projektskizze: "Projektskizze",
  helferliste: "Helferliste",
  foerderbestaetigung_bund: "Förderbestätigung Bund",
  programm_flyer: "Programm / Flyer",
  stundenzettel: "Stundenzettel",
  sonstige: "Sonstige",
};

export function AnlageDownload({ anlage }: { anlage: Anlage }) {
  const [loading, setLoading] = useState(false);

  async function download() {
    setLoading(true);
    const { data, error } = await supabase.storage
      .from("antragsbelege")
      .createSignedUrl(anlage.storage_path, 3600);
    setLoading(false);
    if (error || !data?.signedUrl) {
      alert("Download fehlgeschlagen: " + (error?.message ?? "kein Link"));
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  const groesseMB =
    anlage.groesse_bytes != null ? (anlage.groesse_bytes / 1024 / 1024).toFixed(2) : "?";

  return (
    <div className="flex items-center justify-between rounded border border-slate-200 px-3 py-2">
      <div>
        <p className="font-medium text-sm">
          {TYP_LABELS[anlage.anlagentyp] ?? anlage.anlagentyp}
        </p>
        <p className="text-xs text-slate-500">
          {anlage.dateiname} · {groesseMB} MB
        </p>
      </div>
      <Button size="sm" variant="outline" disabled={loading} onClick={download}>
        <Download className="h-4 w-4" /> Download
      </Button>
    </div>
  );
}
