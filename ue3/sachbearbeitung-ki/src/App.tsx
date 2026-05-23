import { Routes, Route, Navigate } from "react-router-dom";
import { Login } from "./pages/Login";
import { AuthCallback } from "./pages/AuthCallback";
import { Inbox } from "./pages/Inbox";
import { AntragDetail } from "./pages/AntragDetail";
import { OntologieInspector } from "./pages/OntologieInspector";
import { AhpInspector } from "./pages/AhpInspector";
import { NormStatementsInspector } from "./pages/NormStatementsInspector";
import { AdoptionDashboard } from "./pages/AdoptionDashboard";
import { AuthGuard } from "./components/AuthGuard";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/inbox" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route
        path="/inbox"
        element={
          <AuthGuard>
            <Inbox />
          </AuthGuard>
        }
      />
      <Route
        path="/antrag/:id"
        element={
          <AuthGuard>
            <AntragDetail />
          </AuthGuard>
        }
      />
      <Route
        path="/ontologie"
        element={
          <AuthGuard>
            <OntologieInspector />
          </AuthGuard>
        }
      />
      <Route
        path="/ahp"
        element={
          <AuthGuard>
            <AhpInspector />
          </AuthGuard>
        }
      />
      <Route
        path="/normen"
        element={
          <AuthGuard>
            <NormStatementsInspector />
          </AuthGuard>
        }
      />
      <Route
        path="/dashboard/adoption"
        element={
          <AuthGuard>
            <AdoptionDashboard />
          </AuthGuard>
        }
      />
      <Route path="*" element={<Navigate to="/inbox" replace />} />
    </Routes>
  );
}
