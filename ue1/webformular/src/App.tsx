// Top-Level-Routing. BrowserRouter wird in main.tsx eingerichtet (mit basename
// für GH-Pages-Subpath).
//
// Sprach-Reaktivität: setSprache (in i18n.ts) dispatcht ein CustomEvent —
// hier hängen wir uns mit useEffect dran und triggern via key={sprache} ein
// komplettes Remount des Routes-Baums. So lesen alle t()/tx()-Calls in den
// Pages garantiert den neuen Wert. AntragContext überlebt das (localStorage).

import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AntragProvider } from "./state/AntragContext";
import { Layout } from "./components/Layout";
import { FBWahl } from "./pages/FBWahl";
import { Phase1Antragsteller } from "./pages/Phase1Antragsteller";
import { Phase2Dispatch } from "./pages/Phase2Dispatch";
import { Phase3Anlagen } from "./pages/Phase3Anlagen";
import { Danke } from "./pages/Danke";
import { PrefillBootstrap } from "./pages/PrefillBootstrap";
import { AgentHandoffBootstrap } from "./pages/AgentHandoffBootstrap";
import { getSprache, SPRACHE_CHANGED_EVENT, type Sprache } from "./lib/i18n";

export default function App(): JSX.Element {
  const [sprache, setSpracheState] = useState<Sprache>(getSprache());

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<Sprache>).detail;
      setSpracheState(detail ?? getSprache());
    };
    document.addEventListener(SPRACHE_CHANGED_EVENT, handler);
    return () => document.removeEventListener(SPRACHE_CHANGED_EVENT, handler);
  }, []);

  return (
    <AntragProvider>
      <Layout>
        {/* key={sprache} → bei Wechsel komplette Routes neu mounten,
            damit jeder t()/tx()-Call in den Pages den neuen Wert liest. */}
        <Routes key={sprache}>
          <Route path="/" element={<FBWahl />} />
          <Route path="/antrag/phase-1" element={<Phase1Antragsteller />} />
          <Route path="/antrag/phase-2" element={<Phase2Dispatch />} />
          <Route path="/antrag/phase-3" element={<Phase3Anlagen />} />
          <Route path="/antrag/danke/:antragsnummer" element={<Danke />} />
          {/* UE0→UE1: lädt bestehenden Antrag (von n8n-OCR), füllt Wizard vor */}
          <Route path="/antrag/uebernahme/:antragId" element={<PrefillBootstrap />} />
          {/* UE4→UE1: dekodiert Base64-Payload aus URL-Hash, füllt Wizard vor */}
          <Route path="/antrag/uebernahme-chat" element={<AgentHandoffBootstrap />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </AntragProvider>
  );
}
