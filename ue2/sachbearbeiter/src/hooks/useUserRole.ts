import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useSession } from "./useSession";

export function useUserRole(): {
  rolle: string | null;
  loading: boolean;
  allowed: boolean;
} {
  const { session, loading: sessionLoading } = useSession();
  const [rolle, setRolle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user?.email) {
      setRolle(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("allow_email")
      .select("rolle")
      .eq("email", session.user.email)
      .maybeSingle()
      .then(({ data }) => {
        setRolle((data?.rolle as string | undefined) ?? null);
        setLoading(false);
      });
  }, [session?.user?.email]);

  return {
    rolle,
    loading: sessionLoading || loading,
    allowed: rolle !== null,
  };
}
