import { Routes, Route, Navigate } from "react-router-dom";
import { Login } from "./pages/Login";
import { AuthCallback } from "./pages/AuthCallback";
import { Inbox } from "./pages/Inbox";
import { AntragDetail } from "./pages/AntragDetail";
import { SmartUpload } from "./pages/SmartUpload";
import { ComplianceStatus } from "./pages/ComplianceStatus";
import { AuthGuard } from "./components/AuthGuard";

/**
 * UE3-Routing — Multi-FB-Variante mit KI-Features.
 *
 * Alte Routen (Ontologie, AHP-Inspector, Normen, Adoption) sind mit der
 * apl2-Schema-Migration weggefallen — wenn sie zurückkehren, dann gegen
 * die neuen apl.*-Tabellen.
 */
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
        path="/smart-upload"
        element={
          <AuthGuard>
            <SmartUpload />
          </AuthGuard>
        }
      />
      <Route
        path="/compliance"
        element={
          <AuthGuard>
            <ComplianceStatus />
          </AuthGuard>
        }
      />
      <Route path="*" element={<Navigate to="/inbox" replace />} />
    </Routes>
  );
}
