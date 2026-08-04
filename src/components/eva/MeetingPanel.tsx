import { useEffect, useRef } from "react";
import { FileText, Mic, MonitorUp, Square } from "lucide-react";
import { HoloPanel } from "./HoloPanel";
import { useMeetingContext } from "./MeetingContext";

export function MeetingPanel({ delay }: { delay?: number }) {
  const meeting = useMeetingContext();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [meeting.segments, meeting.interim]);

  const recording = meeting.status === "recording" || meeting.status === "connecting";

  return (
    <HoloPanel
      title="Meeting Minutes"
      icon={<FileText className="h-4 w-4" />}
      delay={delay}
      accent="violet"
    >
      <div className="flex flex-col gap-3">
        {!recording && meeting.status !== "stopping" && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => meeting.startMeeting("in-person")}
              className="flex items-center gap-1.5 rounded-full border border-violet/40 px-3 py-1.5 text-xs uppercase tracking-widest text-violet transition hover:bg-violet/10"
            >
              <Mic className="h-3.5 w-3.5" /> In-Person
            </button>
            <button
              onClick={() => meeting.startMeeting("online")}
              className="flex items-center gap-1.5 rounded-full border border-violet/40 px-3 py-1.5 text-xs uppercase tracking-widest text-violet transition hover:bg-violet/10"
            >
              <MonitorUp className="h-3.5 w-3.5" /> Online Call
            </button>
          </div>
        )}

        {(recording || meeting.status === "stopping") && (
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs uppercase tracking-widest text-accent">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              {meeting.status === "connecting"
                ? "Connecting…"
                : meeting.status === "stopping"
                  ? "Saving…"
                  : "Recording"}
            </span>
            <button
              onClick={() => void meeting.endMeeting()}
              disabled={meeting.status === "stopping"}
              className="flex items-center gap-1.5 rounded-full border border-red-500/50 px-3 py-1.5 text-xs uppercase tracking-widest text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
            >
              <Square className="h-3.5 w-3.5" /> End &amp; Save
            </button>
          </div>
        )}

        {meeting.error && <p className="text-xs text-amber-400">{meeting.error}</p>}

        <div
          ref={scrollRef}
          className="max-h-56 min-h-[80px] overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-3 text-xs leading-relaxed"
        >
          {!meeting.segments.length && !meeting.interim && (
            <p className="text-muted-foreground">
              Transcript will appear here once the meeting starts — say "Eva, start an in-person
              meeting" or "Eva, start an online call," or use the buttons above.
            </p>
          )}
          {meeting.segments.map((s) => (
            <p key={s.id} className="mb-1.5">
              <span className="font-semibold text-violet">{s.speaker}:</span>{" "}
              <span className="text-foreground/90">{s.text}</span>
            </p>
          ))}
          {meeting.interim && <p className="italic text-muted-foreground">{meeting.interim}</p>}
        </div>

        {meeting.audioUrl && (
          <audio controls src={meeting.audioUrl} className="w-full" preload="metadata">
            Your browser does not support inline audio playback.
          </audio>
        )}

        {meeting.save.phase !== "idle" && (
          <p
            className={`text-xs ${
              meeting.save.phase === "error"
                ? "text-red-400"
                : meeting.save.phase === "done"
                  ? "text-emerald-400"
                  : "text-muted-foreground"
            }`}
          >
            {meeting.save.phase === "generating" && "Generating minutes from the transcript…"}
            {meeting.save.phase === "saving" && "Saving minutes to your workspace…"}
            {(meeting.save.phase === "done" || meeting.save.phase === "error") &&
              meeting.save.detail}
          </p>
        )}
      </div>
    </HoloPanel>
  );
}
