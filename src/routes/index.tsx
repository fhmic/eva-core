import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { Mic, MicOff, Send, Sparkles, Square } from "lucide-react";

import { ParticleField } from "@/components/eva/ParticleField";
import { AICore } from "@/components/eva/AICore";
import { Waveform } from "@/components/eva/Waveform";
import { HoloPanel } from "@/components/eva/HoloPanel";
import {
  CalendarWidget,
  EmailWidget,
  NewsWidget,
  RadarWidget,
  SpotifyWidget,
  SystemHealthWidget,
  WeatherWidget,
} from "@/components/eva/Widgets";
import { speak, stopSpeaking, useVoice } from "@/components/eva/useVoice";
import { WorkspacePanel } from "@/components/eva/WorkspacePanel";
import type { WorkspaceEntry } from "@/lib/workspace";
import { evaChat } from "@/lib/eva.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EVA — Executive Virtual Assistant Interface" },
      {
        name: "description",
        content:
          "EVA is a holographic AI command deck with voice control, live intelligence feeds, schedule, music and system telemetry.",
      },
      { property: "og:title", content: "EVA — Executive Virtual Assistant Interface" },
      {
        property: "og:description",
        content:
          "A cinematic, JARVIS-inspired AI operating system: voice-driven assistant, holographic panels and real-time telemetry.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EvaDashboard,
});

type Msg = { role: "user" | "assistant"; content: string };

function EvaDashboard() {
  const chat = useServerFn(evaChat);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content: "Good day Felix. Eva online and ready. How may I assist you today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [clock, setClock] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const workspaceRef = useRef<string>("");
  const onWorkspace = useCallback((dir: string | null, entries: WorkspaceEntry[]) => {
    workspaceRef.current = dir
      ? `[Workspace context] Approved local folder: /${dir}. Contents: ${
          entries.map((e) => `${e.name}${e.kind === "directory" ? "/" : ""}`).join(", ") || "empty"
        }. You can guide Felix to compile any spreadsheet there into a presentation from the Local Workspace panel.`
      : "";
  }, []);

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

  const send = useCallback(
    async (text: string, voiceReply: boolean) => {
      const clean = text.trim();
      if (!clean || thinking) return;
      stopSpeaking();
      const next: Msg[] = [...messagesRef.current, { role: "user", content: clean }];
      setMessages(next);
      setInput("");
      setThinking(true);
      try {
        const payload = next.slice(-20);
        const ctx = workspaceRef.current;
        const withContext: Msg[] = ctx
          ? payload.map((m, i) =>
              i === payload.length - 1 ? { ...m, content: `${ctx}\n\n${m.content}` } : m,
            )
          : payload;
        const { reply } = await chat({ data: { messages: withContext } });
        setMessages((m) => [...m, { role: "assistant", content: reply }]);
        if (voiceReply) {
          setSpeaking(true);
          speak(reply, () => setSpeaking(false));
        }
      } catch (err) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content:
              err instanceof Error ? err.message : "I couldn't reach the intelligence core, Felix.",
          },
        ]);
      } finally {
        setThinking(false);
      }
    },
    [chat, thinking],
  );

  const onCommand = useCallback((text: string) => void send(text, true), [send]);
  const onWake = useCallback(() => {
    const greeting = "Good day Felix. Eva online and ready. How may I assist you today?";
    setMessages((m) => [...m, { role: "assistant", content: greeting }]);
    setSpeaking(true);
    speak(greeting, () => setSpeaking(false));
  }, []);

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
          </div>
        </header>

        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_300px]">
          <div className="space-y-4">
            <SystemHealthWidget delay={60} />
            <RadarWidget delay={120} />
            <WeatherWidget delay={180} />
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
              <div ref={logRef} className="max-h-[340px] min-h-[220px] space-y-3 overflow-y-auto pr-1">
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
            <SpotifyWidget delay={60} />
            <CalendarWidget delay={120} />
            <EmailWidget delay={180} />
            <NewsWidget delay={240} />
          </div>
        </div>
      </div>
    </main>
  );
}
