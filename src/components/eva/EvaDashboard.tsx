import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import { LogOut, Mic, MicOff, Send, Sparkles, Square } from "lucide-react";

import { ParticleField } from "@/components/eva/ParticleField";
import { AICore } from "@/components/eva/AICore";
import { Waveform } from "@/components/eva/Waveform";
import { HoloPanel } from "@/components/eva/HoloPanel";
import {
  CalendarWidget,
  EmailWidget,
  NewsWidget,
  RadarWidget,
  SystemHealthWidget,
  WeatherWidget,
} from "@/components/eva/Widgets";
import { MediaProvider, useMedia } from "@/components/eva/MediaContext";
import { MediaPanel } from "@/components/eva/MediaPanel";
import { AuditLogPanel } from "@/components/eva/AuditLogPanel";
import { SessionsPanel } from "@/components/eva/SessionsPanel";
import { parseMediaIntent } from "@/lib/media-intents";
import type { DirectoryHandleLike, WorkspaceEntry } from "@/lib/workspace";
import { speak, stopSpeaking, useVoice } from "@/components/eva/useVoice";
import { WorkspacePanel, type WorkspaceBridge } from "@/components/eva/WorkspacePanel";
import { parseToolCalls, runToolCalls, type EvaToolCall } from "@/lib/file-agent";
import { evaChat } from "@/lib/eva.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  createThread,
  deleteThread,
  listMessages,
  listThreads,
  recentMemory,
  recordAudit,
  renameThread,
  saveMessage,
  type ThreadRow,
} from "@/lib/eva-db";

const GREETING = "Good day Felix. Eva online and ready. How may I assist you today?";

const AUDITED = new Set(["create_folder", "write_file", "move_file", "delete_file"]);

type Msg = { role: "user" | "assistant"; content: string };

export function EvaDashboard({ threadId }: { threadId: string }) {
  return (
    <MediaProvider>
      <Dashboard key={threadId} threadId={threadId} />
    </MediaProvider>
  );
}

function auditPath(call: EvaToolCall) {
  return call.tool === "move_file" ? `${call.from} → ${call.to}` : (call as { path?: string }).path;
}

function Dashboard({ threadId }: { threadId: string }) {
  const chat = useServerFn(evaChat);
  const media = useMedia();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [auditVersion, setAuditVersion] = useState(0);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [clock, setClock] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const memoryRef = useRef<Msg[]>([]);
  const workspaceRef = useRef<string>("");
  const bridgeRef = useRef<WorkspaceBridge | null>(null);

  const onWorkspace = useCallback((dir: string | null, entries: WorkspaceEntry[]) => {
    workspaceRef.current = dir
      ? `[Workspace context] Approved local folder: /${dir}. Contents: ${
          entries.map((e) => `${e.name}${e.kind === "directory" ? "/" : ""}`).join(", ") || "empty"
        }. You have live disk tools (create_folder, write_file, move_file, delete_file, read_file, list_directory) bound to this root — emit eva-tool blocks to execute them.`
      : "";
  }, []);

  const logAudit = useCallback(
    async (action: string, path: string | null, ok: boolean, detail: string | null) => {
      await recordAudit({ threadId, action, path, ok, detail, source: "agent" });
      setAuditVersion((v) => v + 1);
    },
    [threadId],
  );

  const panelAudit = useCallback(
    (action: string, path: string | null, ok: boolean, detail: string | null) => {
      void recordAudit({ threadId, action, path, ok, detail, source: "panel" }).then(() =>
        setAuditVersion((v) => v + 1),
      );
    },
    [threadId],
  );

  /* ---------------- history ---------------- */

  const refreshThreads = useCallback(async () => {
    try {
      setThreads(await listThreads());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [rows, memory] = await Promise.all([
        listMessages(threadId).catch(() => []),
        recentMemory(threadId).catch(() => [] as Msg[]),
      ]);
      if (cancelled) return;
      memoryRef.current = memory;
      if (rows.length === 0) {
        setMessages([{ role: "assistant", content: GREETING }]);
        void saveMessage(threadId, "assistant", GREETING);
      } else {
        setMessages(rows.map((r) => ({ role: r.role, content: r.content })));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  useEffect(() => {
    void refreshThreads();
  }, [refreshThreads, messages.length]);

  const append = useCallback(
    (role: "user" | "assistant", content: string) => {
      setMessages((m) => [...m, { role, content }]);
      void saveMessage(threadId, role, content);
    },
    [threadId],
  );

  const newSession = useCallback(async () => {
    const t = await createThread("New session");
    await refreshThreads();
    void navigate({ to: "/s/$threadId", params: { threadId: t.id } });
  }, [navigate, refreshThreads]);

  const removeSession = useCallback(
    async (id: string) => {
      await deleteThread(id);
      const rest = await listThreads();
      setThreads(rest);
      if (id === threadId) {
        const next = rest[0] ?? (await createThread("New session"));
        void navigate({ to: "/s/$threadId", params: { threadId: next.id } });
      }
    },
    [navigate, threadId],
  );

  /* ---------------- chrome ---------------- */

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [threadId, thinking]);

  /* ---------------- conversation ---------------- */

  const send = useCallback(
    async (text: string, voiceReply: boolean) => {
      const clean = text.trim();
      if (!clean || thinking) return;
      stopSpeaking();

      const intent = parseMediaIntent(clean);
      if (intent) {
        append("user", clean);
        setInput("");
        let reply = "";
        if (intent.type === "play_local_track") reply = await media.playLocalByQuery(intent.query);
        else if (intent.type === "stream_web_music")
          reply = await media.streamWebMusic(intent.track, intent.artist);
        else if (intent.type === "search_local_music") {
          const hits = media.searchLocalMusic(intent.query, intent.folderPath);
          media.setLastResults(hits);
          reply = hits.length
            ? `I found ${hits.length} local match${hits.length === 1 ? "" : "es"}, Felix. Top result: ${hits[0].title} by ${hits[0].artist}.`
            : `Nothing in your indexed folders matches "${intent.query}", Felix. Say "play ${intent.query} on the web" and I'll stream it instead.`;
        } else if (intent.type === "set_volume") {
          media.setVolume(intent.volume);
          reply = `Volume set to ${Math.round(intent.volume * 100)} percent.`;
        } else reply = media.mediaControl(intent.action);
        append("assistant", reply);
        if (voiceReply) {
          setSpeaking(true);
          speak(reply, () => setSpeaking(false));
        }
        return;
      }

      const next: Msg[] = [...messagesRef.current, { role: "user", content: clean }];
      append("user", clean);
      setInput("");
      setThinking(true);
      try {
        const payload = next.slice(-20);
        const ctxParts = [workspaceRef.current].filter(Boolean);
        if (memoryRef.current.length) {
          ctxParts.unshift(
            `[Long-term memory — excerpts from Felix's earlier sessions, oldest first]\n${memoryRef.current
              .map((m) => `${m.role === "user" ? "Felix" : "Eva"}: ${m.content.slice(0, 400)}`)
              .join("\n")}`,
          );
        }
        const ctx = ctxParts.join("\n\n");
        const withContext: Msg[] = ctx
          ? payload.map((m, i) =>
              i === payload.length - 1 ? { ...m, content: `${ctx}\n\n${m.content}` } : m,
            )
          : payload;
        const { reply } = await chat({ data: { messages: withContext } });
        const { calls, cleaned } = parseToolCalls(reply);
        const bridge = bridgeRef.current;

        if (calls.length && !bridge) {
          const notice =
            (cleaned ? `${cleaned}\n\n` : "") +
            "I need disk access first, Felix — grant a folder in the Local Workspace panel and I'll execute that immediately.";
          append("assistant", notice);
          if (voiceReply) {
            setSpeaking(true);
            speak(notice, () => setSpeaking(false));
          }
          return;
        }

        let spoken = cleaned || reply;
        append("assistant", spoken);

        if (calls.length && bridge) {
          const { results, tree } = await runToolCalls(bridge.dir, calls, bridge.requestConfirm);
          await bridge.refresh();
          for (let i = 0; i < results.length; i++) {
            const call = calls[i];
            if (!call || !AUDITED.has(call.tool)) continue;
            await logAudit(call.tool, auditPath(call) ?? null, results[i].ok, results[i].message);
          }
          const report = results.map((r) => `- ${r.ok ? "OK" : "FAILED"}: ${r.message}`).join("\n");
          append("assistant", `**Disk agent report**\n${report}`);
          const followUp: Msg[] = [
            ...next,
            { role: "assistant", content: spoken },
            {
              role: "user",
              content: `[file agent verification]\n${report}\n\nVerified contents of /${bridge.dir.name}:\n${tree.join("\n") || "empty"}\n\nConfirm the outcome to Felix in one or two sentences.`,
            },
          ];
          const confirmation = await chat({ data: { messages: followUp.slice(-20) } });
          spoken = parseToolCalls(confirmation.reply).cleaned || confirmation.reply;
          append("assistant", spoken);
        }

        if (voiceReply) {
          setSpeaking(true);
          speak(spoken, () => setSpeaking(false));
        }
      } catch (err) {
        append(
          "assistant",
          err instanceof Error ? err.message : "I couldn't reach the intelligence core, Felix.",
        );
      } finally {
        setThinking(false);
      }
    },
    [append, chat, logAudit, media, thinking],
  );

  // Name the session after Felix's first directive.
  const titledRef = useRef(false);
  useEffect(() => {
    if (titledRef.current) return;
    const first = messages.find((m) => m.role === "user");
    if (!first) return;
    titledRef.current = true;
    void renameThread(threadId, first.content.slice(0, 60)).then(refreshThreads);
  }, [messages, refreshThreads, threadId]);

  const onCommand = useCallback((text: string) => void send(text, true), [send]);
  const onWake = useCallback(() => {
    append("assistant", GREETING);
    setSpeaking(true);
    speak(GREETING, () => setSpeaking(false));
  }, [append]);

  const voice = useVoice({ onCommand, onWake });

  const coreState = thinking
    ? "thinking"
    : speaking
      ? "speaking"
      : voice.awake
        ? "listening"
        : "idle";

  return (
    <main className="relative min-h-screen overflow-x-hidden">
      <ParticleField />

      <div className="relative z-10 mx-auto max-w-[1600px] px-4 py-5 lg:px-8">
        <header className="animate-fade-up mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-[0.35em] text-primary text-glow">
              EVA
            </h1>
            <p className="label-hud">Executive Virtual Assistant · Felix Michael</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-display text-lg tracking-widest text-accent">{clock}</span>
            <span
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${
                voice.awake
                  ? "border-accent/60 text-accent"
                  : voice.listening
                    ? "border-primary/50 text-primary"
                    : "border-border text-muted-foreground"
              }`}
            >
              <span className="size-1.5 animate-pulse rounded-full bg-current" />
              {voice.awake ? "Active" : voice.listening ? "Passive listening" : "Standby"}
            </span>
            <button
              onClick={() => void supabase.auth.signOut().then(() => navigate({ to: "/auth" }))}
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition hover:text-foreground"
            >
              <LogOut size={12} /> Sign out
            </button>
          </div>
        </header>

        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_300px]">
          <div className="space-y-4">
            <WorkspacePanel
              delay={40}
              bridgeRef={bridgeRef}
              onEntries={onWorkspace}
              onAudit={panelAudit}
              onDirectory={(dir: DirectoryHandleLike | null) => void media.indexDirectory(dir)}
            />
            <AuditLogPanel delay={80} version={auditVersion} />
            <SystemHealthWidget delay={120} />
            <RadarWidget delay={160} />
            <WeatherWidget delay={200} />
          </div>

          <div className="space-y-4">
            <div className="holo-panel animate-fade-up p-5">
              <AICore state={coreState} level={voice.level} />
              <div className="mt-4">
                <Waveform level={voice.level} active={voice.listening || speaking} />
              </div>
              <p className="mt-2 min-h-5 text-center text-xs text-muted-foreground">
                {voice.transcript ||
                  (voice.supported
                    ? voice.listening
                      ? 'Say "Hello Eva" to activate'
                      : "Voice interface offline"
                    : "Voice recognition unavailable in this browser")}
              </p>
              <div className="mt-4 flex justify-center gap-3">
                <button
                  onClick={() => (voice.listening ? voice.stop() : void voice.start())}
                  disabled={!voice.supported}
                  className="flex items-center gap-2 rounded-full border border-accent/50 bg-secondary px-5 py-2 text-sm text-accent transition hover:scale-[1.03] disabled:opacity-40"
                  style={{ boxShadow: "var(--shadow-glow)" }}
                >
                  {voice.listening ? <MicOff size={15} /> : <Mic size={15} />}
                  {voice.listening ? "End session" : "Start listening"}
                </button>
                {speaking && (
                  <button
                    onClick={() => {
                      stopSpeaking();
                      setSpeaking(false);
                    }}
                    className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition hover:text-foreground"
                  >
                    <Square size={13} /> Interrupt
                  </button>
                )}
              </div>
            </div>

            <HoloPanel
              title="Response Channel"
              icon={<Sparkles size={14} />}
              delay={220}
              className="flex flex-col"
            >
              <div
                ref={logRef}
                className="max-h-[340px] min-h-[220px] space-y-3 overflow-y-auto pr-1"
              >
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`animate-fade-up max-w-[88%] rounded-xl border px-3 py-2 text-sm ${
                      m.role === "user"
                        ? "ml-auto border-primary/40 bg-secondary/60 text-foreground"
                        : "border-accent/30 bg-muted/50 text-foreground/95"
                    }`}
                  >
                    <span className="label-hud">{m.role === "user" ? "Felix" : "Eva"}</span>
                    <div className="prose prose-sm prose-invert mt-1 max-w-none prose-p:my-1 prose-ul:my-1">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  </div>
                ))}
                {thinking && (
                  <div className="flex items-center gap-2 text-xs text-accent">
                    <span className="size-1.5 animate-ping rounded-full bg-accent" />
                    Eva is processing…
                  </div>
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(input, false);
                }}
                className="mt-3 flex items-center gap-2"
              >
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type a directive for Eva…"
                  aria-label="Message Eva"
                  className="h-10 flex-1 rounded-full border border-border bg-secondary/50 px-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent/60"
                />
                <button
                  type="submit"
                  disabled={thinking}
                  aria-label="Send"
                  className="grid size-10 place-items-center rounded-full border border-accent/50 bg-secondary text-accent transition hover:scale-105 disabled:opacity-40"
                  style={{ boxShadow: "var(--shadow-glow)" }}
                >
                  <Send size={15} />
                </button>
              </form>
            </HoloPanel>
          </div>

          <div className="space-y-4">
            <SessionsPanel
              delay={40}
              threads={threads}
              activeId={threadId}
              onCreate={() => void newSession()}
              onDelete={(id) => void removeSession(id)}
            />
            <MediaPanel delay={80} />
            <CalendarWidget delay={140} />
            <EmailWidget delay={200} />
            <NewsWidget delay={260} />
          </div>
        </div>
      </div>
    </main>
  );
}
