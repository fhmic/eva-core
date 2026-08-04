import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createThread, listThreads } from "@/lib/eva-db";
import { ParticleField } from "@/components/eva/ParticleField";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EVA: Executive Virtual Assistant Interface" },
      {
        name: "description",
        content:
          "EVA is a holographic AI command deck with voice control, persistent conversation memory, a local file agent and a timestamped disk audit log.",
      },
      { property: "og:title", content: "EVA: Executive Virtual Assistant Interface" },
      {
        property: "og:description",
        content:
          "A cinematic, JARVIS-inspired AI operating system: voice-driven assistant, saved session memory and real-time telemetry.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Bootstrap,
});

function Bootstrap() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        if (!data.session) {
          void navigate({ to: "/auth" });
          return;
        }
        const threads = await listThreads();
        const target = threads[0] ?? (await createThread("New session"));
        if (!active) return;
        void navigate({ to: "/s/$threadId", params: { threadId: target.id }, replace: true });
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not open a session.");
      }
    })();
    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <main className="relative grid min-h-screen place-items-center">
      <ParticleField />
      <div className="relative z-10 text-center">
        <h1 className="font-display text-3xl font-bold tracking-[0.35em] text-primary text-glow">
          EVA
        </h1>
        <p className="label-hud mt-2 animate-pulse">
          {error ?? "Initialising command deck…"}
        </p>
      </div>
    </main>
  );
}
