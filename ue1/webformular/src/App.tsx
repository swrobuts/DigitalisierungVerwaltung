// Top-Level-Routing. BrowserRouter wird in main.tsx eingerichtet (mit basename
// für GH-Pages-Subpath).

import { Routes, Route, Navigate } from "react-router-dom";
import { AntragProvider } from "./state/AntragContext";
import { Layout } from "./components/Layout";
import { FBWahl } from "./pages/FBWahl";
import { Phase1Antragsteller } from "./pages/Phase1Antragsteller";
import { Phase2Dispatch } from "./pages/Phase2Dispatch";
import { Phase3Anlagen } from "./pages/Phase3Anlagen";
import { Danke } from "./pages/Danke";

export default function App(): JSX.Element {
  return (
    <AntragProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<FBWahl />} />
          <Route path="/antrag/phase-1" element={<Phase1Antragsteller />} />
          <Route path="/antrag/phase-2" element={<Phase2Dispatch />} />
          <Route path="/antrag/phase-3" element={<Phase3Anlagen />} />
          <Route path="/antrag/danke/:antragsnummer" element={<Danke />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </AntragProvider>
  );
}
