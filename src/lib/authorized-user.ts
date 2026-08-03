/**
 * EVA is a single-user assistant. Only this email may hold a session — anyone
 * else who obtains one (via signup, OAuth, or otherwise) is immediately signed
 * out. Set VITE_EVA_ALLOWED_EMAIL in your deployment env to override; falls
 * back to the known account below if unset. This is a UX-layer guard, not the
 * security boundary — the authoritative fix is disabling public signups in
 * the Supabase dashboard (Authentication → Settings).
 */
const ALLOWED_EMAIL = (import.meta.env.VITE_EVA_ALLOWED_EMAIL || "elitesprince@gmail.com")
  .trim()
  .toLowerCase();

export function isAuthorizedEmail(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase() === ALLOWED_EMAIL;
}