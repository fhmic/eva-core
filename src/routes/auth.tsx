import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ParticleField } from "@/components/eva/ParticleField";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in to EVA — Executive Virtual Assistant" },
      {
        name: "description",
        content:
          "Authenticate to reach your EVA command deck, persistent conversation memory and workspace audit log.",
      },
      { property: "og:title", content: "Sign in to EVA" },
      {
        property: "og:description",
        content: "Secure access to the EVA holographic assistant and its session memory.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/" });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setNotice("Account created. Check your inbox if confirmation is required, then sign in.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        void navigate({ to: "/" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError(null);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      } as any);
      if (error) throw error;
      // If Supabase returns a redirect url, follow it
      if ((data as any)?.url) {
        window.location.href = (data as any).url;
        return;
      }
      void navigate({ to: "/" });
    } catch (err) {
      setError("Google sign-in failed. Please try again.");
    }
  };

  return (
    <main className="relative grid min-h-screen place-items-center px-4">
      <ParticleField />
      <div className="holo-panel relative z-10 w-full max-w-sm p-6">
        <h1 className="font-display text-2xl font-bold tracking-[0.35em] text-primary text-glow">
          EVA
        </h1>
        <p className="label-hud mt-1">Identity verification required</p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            aria-label="Email"
            className="h-10 w-full rounded-full border border-border bg-secondary/50 px-4 text-sm text-foreground outline-none focus:border-accent/60"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            aria-label="Password"
            className="h-10 w-full rounded-full border border-border bg-secondary/50 px-4 text-sm text-foreground outline-none focus:border-accent/60"
          />
          <button
            type="submit"
            disabled={busy}
            className="h-10 w-full rounded-full border border-accent/50 bg-secondary text-sm text-accent transition hover:scale-[1.02] disabled:opacity-40"
            style={{ boxShadow: "var(--shadow-glow)" }}
          >
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          onClick={() => void google()}
          className="mt-3 h-10 w-full rounded-full border border-border text-sm text-muted-foreground transition hover:text-foreground"
        >
          Continue with Google
        </button>

        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
        {notice && <p className="mt-3 text-xs text-accent">{notice}</p>}

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 w-full text-center text-xs text-muted-foreground transition hover:text-accent"
        >
          {mode === "signin" ? "No account yet? Register" : "Already registered? Sign in"}
        </button>
      </div>
    </main>
  );
}
