import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  useMeetingCapture,
  segmentsToTranscript,
  type CaptureStatus,
  type MeetingMode,
  type TranscriptSegment,
} from "./useMeetingCapture";
import { buildMinutes } from "@/lib/meeting.functions";
import { minutesToDocxBlob, minutesToMarkdown, minutesFileBaseName } from "@/lib/meeting-docx";
import { writeFilePath, downloadBlob } from "@/lib/workspace";
import type { WorkspaceBridge } from "./WorkspacePanel";

export type SaveState = { phase: "idle" | "generating" | "saving" | "done" | "error"; detail?: string };

type MeetingApi = {
  status: CaptureStatus;
  segments: TranscriptSegment[];
  interim: string;
  error: string | null;
  save: SaveState;
  audioUrl: string | null;
  startMeeting: (mode: MeetingMode) => void;
  endMeeting: () => Promise<string>;
  registerBridgeGetter: (fn: () => WorkspaceBridge | null) => void;
};

const Ctx = createContext<MeetingApi | null>(null);

export function useMeetingContext() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMeetingContext must be used inside <MeetingProvider>");
  return ctx;
}

export function MeetingProvider({ children }: { children: ReactNode }) {
  const cap = useMeetingCapture();
  const [save, setSave] = useState<SaveState>({ phase: "idle" });
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const bridgeGetterRef = useRef<() => WorkspaceBridge | null>(() => null);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const registerBridgeGetter = useCallback((fn: () => WorkspaceBridge | null) => {
    bridgeGetterRef.current = fn;
  }, []);

  const startMeeting = useCallback(
    (mode: MeetingMode) => {
      setSave({ phase: "idle" });
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
      void cap.start(mode);
    },
    [cap, audioUrl],
  );

  /** Stops capture, generates minutes, saves everything, and returns a short spoken summary. */
  const endMeeting = useCallback(async (): Promise<string> => {
    const { segments, audioBlob } = await cap.stop();
    if (!segments.length) {
      const msg = "No speech was captured, so there's nothing to save.";
      setSave({ phase: "error", detail: msg });
      return msg;
    }
    if (audioBlob) setAudioUrl(URL.createObjectURL(audioBlob));

    setSave({ phase: "generating" });
    let minutes;
    try {
      const transcript = segmentsToTranscript(segments);
      const res = await buildMinutes({ data: { transcript } });
      minutes = res.minutes;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not generate minutes from the transcript.";
      setSave({ phase: "error", detail: msg });
      return msg;
    }

    setSave({ phase: "saving" });
    try {
      const bridge = bridgeGetterRef.current();
      const base = minutesFileBaseName(minutes);
      const docxBlob = await minutesToDocxBlob(minutes);
      const md = minutesToMarkdown(minutes);

      if (bridge) {
        await writeFilePath(bridge.dir, `Meetings/${base}.docx`, docxBlob);
        await writeFilePath(bridge.dir, `Meetings/${base}.md`, md);
        if (audioBlob) await writeFilePath(bridge.dir, `Meetings/${base}.webm`, audioBlob);
        await bridge.refresh();
        const detail = audioBlob
          ? `Saved minutes and audio to /${bridge.dir.name}/Meetings/${base}.*`
          : `Saved to /${bridge.dir.name}/Meetings/${base}.docx`;
        setSave({ phase: "done", detail });
        return `Minutes saved: "${minutes.title}". ${detail}`;
      }
      downloadBlob(docxBlob, `${base}.docx`);
      if (audioBlob) downloadBlob(audioBlob, `${base}.webm`);
      const detail = "No workspace folder granted, so files downloaded directly instead.";
      setSave({ phase: "done", detail });
      return `Minutes generated: "${minutes.title}". ${detail}`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not save the minutes file.";
      setSave({ phase: "error", detail: msg });
      return msg;
    }
  }, [cap]);

  const value = useMemo<MeetingApi>(
    () => ({
      status: cap.status,
      segments: cap.segments,
      interim: cap.interim,
      error: cap.error,
      save,
      audioUrl,
      startMeeting,
      endMeeting,
      registerBridgeGetter,
    }),
    [cap.status, cap.segments, cap.interim, cap.error, save, audioUrl, startMeeting, endMeeting, registerBridgeGetter],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
