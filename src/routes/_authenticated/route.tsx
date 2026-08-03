import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isAuthorizedEmail } from "@/lib/authorized-user";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const [state, setState] = useState<"checking" | "ready">("checking");

  useEffect(() => {
    let active = true;

    const reject = async () => {
      await supabase.auth.signOut();
      if (active) void navigate({ to: "/auth", search: { denied: "1" } as any });
    };

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) {
        void navigate({ to: "/auth" });
      } else if (!isAuthorizedEmail(data.session.user.email)) {
        void reject();
      } else {
        setState("ready");
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) {
        void navigate({ to: "/auth" });
      } else if (!isAuthorizedEmail(session.user.email)) {
        void reject();
      }
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