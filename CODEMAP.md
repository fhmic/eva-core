# CODEMAP — for Eva's own reference when using the GitHub self-improvement tools

Read this before github_list_tree or github_search_code when you don't already
know where something lives. It's a map, not a spec — always github_read_file
the actual file before proposing a change; this document can go stale.

## Core chat / LLM
- `src/lib/eva.server.ts` — the actual LLM call loop. Provider fallback chain
  (OpenRouter → NVIDIA → Groq → Gemini → HuggingFace), the eva-tool block
  extraction/dispatch, and the tool-call round loop (askEva). This is where a
  new server-side tool (like web_search or the github_* tools) gets wired in.
- `src/lib/eva.functions.ts` — the createServerFn wrapper (evaChat) that the
  client calls; input validation (message count/length caps) lives here.
- `src/lib/eva-prompt.ts` — the entire system prompt as one exported string
  constant (EVA_SYSTEM_PROMPT). Every tool's contract, the VA module, and all
  persona/behaviour rules live here as plain text instructions, not code.
- `src/lib/eva-db.ts` — Supabase queries: threads, messages, cross-session
  memory excerpts, VA progress (day/status/profile).

## Tools Eva can call
- `src/lib/file-agent.ts` — LOCAL workspace tools (create_folder, write_file,
  move_file, delete_file, read_file, list_directory, download_url). These run
  client-side against Felix's browser-approved local folder via the File
  System Access API — NOT this GitHub repo.
- `src/lib/download.server.ts` / `download.functions.ts` — the download_url
  implementation: SSRF-guarded fetch, size cap, extension/content-type
  blocklist.
- `src/lib/websearch.server.ts` — the web_search tool, backed by Tavily.
- `src/lib/github.server.ts` — the self-improvement tools you're using right
  now (github_list_tree, github_search_code, github_read_file,
  github_propose_change). Everything here always lands as a PR, never a
  direct push to main.
- `src/lib/va-agent.ts` — client-side parser/executor for the VA progress
  tool calls (va_set_day, va_set_status, va_set_profile), separate from the
  file-agent's tool set.

## Auth
- `src/routes/auth.tsx` — sign-in page. Single-user allowlist enforced here
  (isAuthorizedEmail) plus at the route guard.
- `src/routes/_authenticated/route.tsx` — the auth guard every protected
  route sits behind; rejects any session whose email isn't the approved one.
- `src/lib/authorized-user.ts` — the actual allowlist check
  (VITE_EVA_ALLOWED_EMAIL env var, defaults to Felix's known account).

## UI
- `src/components/eva/EvaDashboard.tsx` — the single large dashboard
  component: chat log, message send/context-injection logic (workspace +
  memory + VA progress all get prepended here), tool-call result handling,
  and the 3-column responsive layout (left rail / command centre / right
  rail).
- `src/components/eva/useVoice.ts` — wake-word + speech recognition +
  text-to-speech. continuous:false with auto-restart (not continuous:true —
  that has a known WebKit bug on mobile). Synthetic level meter, not a second
  getUserMedia stream.
- `src/components/eva/EvaCore.tsx`, `SubAgentOrbit.tsx` — the visual orb +
  orbiting sub-agent animation in the command centre.
- `src/components/eva/Widgets.tsx` — the smaller dashboard widgets (weather,
  news, system status/health).
- `src/components/eva/MeetingPanel.tsx`, `useMeetingCapture.ts`,
  `MeetingContext.tsx` — meeting capture feature (not yet deeply documented
  here — read these directly if a task touches meeting functionality).
- `src/components/eva/WorkspacePanel.tsx`, `AuditLogPanel.tsx`,
  `MediaPanel.tsx`, `RadarWidget.tsx` — left-rail panels (not yet deeply
  documented here — read directly if relevant).

## Integrations (Microsoft/media — not yet deeply documented here)
- `src/lib/msgraph.ts` — Microsoft Graph integration (Outlook/Teams/OneDrive
  panels reference this).
- `src/lib/media.ts`, `media.server.ts`, `media.functions.ts`,
  `media-intents.ts` — local audio indexing/playback + web-catalogue
  streaming fallback.

## Deployment
- `vite.config.ts` — the Nitro preset config. Defaults to Vercel; set
  NITRO_PRESET=cloudflare_module to build for Cloudflare Workers instead
  (both paths verified working).
- `supabase/migrations/` — schema migrations. Must be run manually against
  the live Supabase project (SQL Editor) — they are not auto-applied on
  deploy.
- `src/integrations/supabase/types.ts` — hand-maintained TypeScript types
  matching the Supabase schema. Must be updated manually whenever a
  migration changes the schema (no live `supabase gen types` access from
  this deployment).

## Known fragile areas — be extra careful reading/proposing changes here
- The provider fallback chain in eva.server.ts has been broken multiple
  times by wrong base URLs/model names for non-OpenRouter providers. Verify
  any provider-specific change against that provider's actual current docs
  before proposing it.
- EvaDashboard.tsx's tool-call follow-up prompt logic (the block after
  runToolCalls) is easy to accidentally regress — it differentiates "just
  confirm" (write/create/delete) from "actually analyze the content"
  (read_file), and losing that distinction silently breaks file-reading
  usefulness.
- src/integrations/supabase/types.ts has been manually corrupted before
  (missing generic `<` characters) during a paste — always read the whole
  Tables/TablesInsert/TablesUpdate/Enums/CompositeTypes block, not just the
  table you're adding, if touching this file.