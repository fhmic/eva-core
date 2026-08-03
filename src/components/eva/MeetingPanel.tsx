import { useEffect, useRef, useState } from "react";
import { FileText, Mic, MonitorUp, Square } from "lucide-react";
import { HoloPanel } from "./HoloPanel";
import { useMeetingCapture, segmentsToTranscript, type MeetingMode } from "./useMeetingCapture";
import { buildMinutes } from "@/lib/meeting.functions";
import { minutesToDocxBlob, minutesToMarkdown, minutesFileBaseName } from "@/lib/meeting-docx";
import { writeFilePath, downloadBlob } from "@/lib/workspace";
import type { WorkspaceBridge } from "./WorkspacePanel";

type SaveState = { phase: "idle" | "generating" | "saving" | "done" | "error"; detail?: string };

export function MeetingPanel({
  delay,
  getBridge,
}: {
  delay?: number;
  getBridge: () => WorkspaceBridge | null;
}) {
  const cap = useMeetingCapture();
  const [save, setSave] = useState<SaveState>({ phase: "idle" });
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [cap.segments, cap.interim]);

  const recording = cap.status === "recording" || cap.status === "connecting";

  const handleStart = (mode: MeetingMode) => {
    setSave({ phase: "idle" });
    void cap.start(mode);
  };

  const handleStop = async () => {
    const segments = await cap.stop();
    if (!segments.length) {
      setSave({ phase: "error", detail: "No speech was captured, so there's nothing to save." });
      return;
    }

    setSave({ phase: "generating" });
    let minutes;
    try {
      const transcript = segmentsToTranscript(segments);
      const res = await buildMinutes({ data: { transcript } });
      minutes = res.minutes;
    } catch (err) {
      setSave({
        phase: "error",
        detail: err instanceof Error ? err.message : "Could not generate minutes from the transcript.",
      });
      return;
    }

    setSave({ phase: "saving" });
    try {
      const bridge = getBridge();
      const base = minutesFileBaseName(minutes);
      const docxBlob = await minutesToDocxBlob(minutes);
      const md = minutesToMarkdown(minutes);

      if (bridge) {
        await writeFilePath(bridge.dir, `Meetings/${base}.docx`, docxBlob);
        await writeFilePath(bridge.dir, `Meetings/${base}.md`, md);
        await bridge.refresh();
        setSave({ phase: "done", detail: `Saved to /${bridge.dir.name}/Meetings/${base}.docx` });
      } else {
        // No workspace folder granted — fall back to a direct browser download
        // so the minutes aren't lost.
        downloadBlob(docxBlob, `${base}.docx`);
        setSave({
          phase: "done",
          detail: "No workspace folder granted, so the .docx downloaded directly instead.",
        });
      }
    } catch (err) {
      setSave({
        phase: "error",
        detail: err instanceof Error ? err.message : "Could not save the minutes file.",
      });
    }
  };

  return (
    <HoloPanel
      title="Meeting Minutes"
      icon={<FileText className="h-4 w-4" />}
      delay={delay}
      accent="violet"
    >
      <div className="flex flex-col gap-3">
        {!recording && cap.status !== "stopping" && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleStart("in-person")}
              className="flex items-center gap-1.5 rounded-full border border-violet/40 px-3 py-1.5 text-xs uppercase tracking-widest text-violet transition hover:bg-violet/10"
            >
              <Mic className="h-3.5 w-3.5" /> In-Person
            </button>
            <button
              onClick={() => handleStart("online")}
              className="flex items-center gap-1.5 rounded-full border border-violet/40 px-3 py-1.5 text-xs uppercase tracking-widest text-violet transition hover:bg-violet/10"
            >
              <MonitorUp className="h-3.5 w-3.5" /> Online Call
            </button>
          </div>
        )}

        {(recording || cap.status === "stopping") && (
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs uppercase tracking-widest text-accent">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              {cap.status === "connecting" ? "Connecting…" : cap.status === "stopping" ? "Saving…" : "Recording"}
            </span>
            <button
              onClick={handleStop}
              disabled={cap.status === "stopping"}
              className="flex items-center gap-1.5 rounded-full border border-red-500/50 px-3 py-1.5 text-xs uppercase tracking-widest text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
            >
              <Square className="h-3.5 w-3.5" /> End &amp; Save
            </button>
          </div>
        )}

        {cap.error && <p className="text-xs text-amber-400">{cap.error}</p>}

        <div
          ref={scrollRef}
          className="max-h-56 min-h-[80px] overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-3 text-xs leading-relaxed"
        >
          {!cap.segments.length && !cap.interim && (
            <p className="text-muted-foreground">Transcript will appear here once the meeting starts.</p>
          )}
          {cap.segments.map((s) => (
            <p key={s.id} className="mb-1.5">
              <span className="font-semibold text-violet">{s.speaker}:</span>{" "}
              <span className="text-foreground/90">{s.text}</span>
            </p>
          ))}
          {cap.interim && <p className="italic text-muted-foreground">{cap.interim}</p>}
        </div>

        {save.phase !== "idle" && (
          <p
            className={`text-xs ${
              save.phase === "error"
                ? "text-red-400"
                : save.phase === "done"
                  ? "text-emerald-400"
                  : "text-muted-foreground"
            }`}
          >
            {save.phase === "generating" && "Generating minutes from the transcript…"}
            {save.phase === "saving" && "Saving minutes to your workspace…"}
            {(save.phase === "done" || save.phase === "error") && save.detail}
          </p>
        )}
      </div>
    </HoloPanel>
  );
}
