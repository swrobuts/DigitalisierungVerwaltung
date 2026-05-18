import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useUserRole } from "../hooks/useUserRole";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { allowed, loading } = useUserRole();
  const location = useLocation();
  if (loading) return <div className="p-8 text-slate-500">Lade …</div>;
  if (!allowed)
    return (
      <Navigate to="/login" state={{ from: location.pathname }} replace />
    );
  return <>{children}</>;
}
