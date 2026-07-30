import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const [state, setState] = useState<"checking" | "ready">("checking");

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) void navigate({ to: "/auth" });
      else setState("ready");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) void navigate({ to: "/auth" });
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  if (state === "checking") {
    return (
      <div className="grid min-h-screen place-items-center">
        <p className="label-hud animate-pulse text-accent">Verifying identity…</p>
      </div>
    );
  }

  return <Outlet />;
}
