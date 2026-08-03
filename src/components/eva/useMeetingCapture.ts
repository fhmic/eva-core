import { useCallback, useRef, useState } from "react";
import { getMeetingToken } from "@/lib/meeting.functions";

export type MeetingMode = "in-person" | "online";

export type TranscriptSegment = {
  id: string;
  speaker: string;
  text: string;
  atMs: number;
};

export type CaptureStatus = "idle" | "connecting" | "recording" | "stopping" | "error";

const DG_URL =
  "wss://api.deepgram.com/v1/listen?model=nova-3&diarize_model=latest&punctuate=true&smart_format=true&interim_results=true&endpointing=300";
function fmtClock(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/** Renders accumulated segments into the plain-text transcript the LLM expects. */
export function segmentsToTranscript(segments: TranscriptSegment[]): string {
  return segments.map((s) => `[${fmtClock(s.atMs)}] ${s.speaker}: ${s.text}`).join("\n");
}

export function useMeetingCapture() {
  const [status, setStatus] = useState<CaptureStatus>("idle");
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const tracksRef = useRef<MediaStreamTrack[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const startRef = useRef(0);
  const segCounter = useRef(0);

  const cleanup = useCallback(() => {
    try {
      recorderRef.current?.stop();
    } catch {
      /* already stopped */
    }
    recorderRef.current = null;
    for (const track of tracksRef.current) {
      try {
        track.stop();
      } catch {
        /* ignore */
      }
    }
    tracksRef.current = [];
    try {
      void audioCtxRef.current?.close();
    } catch {
      /* ignore */
    }
    audioCtxRef.current = null;
    try {
      wsRef.current?.close();
    } catch {
      /* ignore */
    }
    wsRef.current = null;
  }, []);

  const stop = useCallback(async (): Promise<TranscriptSegment[]> => {
    setStatus("stopping");
    // Let Deepgram flush any final result still in flight before we tear the socket down.
    try {
      wsRef.current?.send(JSON.stringify({ type: "CloseStream" }));
    } catch {
      /* socket already gone */
    }
    await new Promise((r) => setTimeout(r, 400));
    cleanup();
    setStatus("idle");
    setInterim("");
    let final: TranscriptSegment[] = [];
    setSegments((s) => {
      final = s;
      return s;
    });
    return final;
  }, [cleanup]);

  const start = useCallback(
    async (mode: MeetingMode) => {
      setError(null);
      setSegments([]);
      setInterim("");
      segCounter.current = 0;
      setStatus("connecting");

      try {
       const { accessToken } = await getMeetingToken();

        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        let combined: MediaStream = micStream;
        tracksRef.current = [...micStream.getTracks()];

        if (mode === "online") {
          // getDisplayMedia requires video:true even though we discard the video
          // track — only useful if the user picks "Chrome Tab" and checks
          // "Share tab audio" in the picker; whole-screen/window shares often
          // don't carry audio at all in Chrome.
          const displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true,
          });
          const displayAudioTracks = displayStream.getAudioTracks();
          tracksRef.current.push(...displayStream.getTracks());

          if (displayAudioTracks.length) {
            const ctx = new AudioContext();
            audioCtxRef.current = ctx;
            const dest = ctx.createMediaStreamDestination();
            ctx.createMediaStreamSource(micStream).connect(dest);
            ctx.createMediaStreamSource(new MediaStream(displayAudioTracks)).connect(dest);
            combined = dest.stream;
          } else {
            setError(
              'No tab/system audio detected — re-share and check "Share tab audio," or continue with mic-only capture.',
            );
          }
        }

        const ws = new WebSocket(DG_URL, ["token", key]);
        wsRef.current = ws;

        ws.onopen = () => {
          startRef.current = Date.now();
          setStatus("recording");

          const recorder = new MediaRecorder(combined, { mimeType: "audio/webm;codecs=opus" });
          recorderRef.current = recorder;
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
              e.data
                .arrayBuffer()
                .then((buf) => ws.send(buf))
                .catch(() => {});
            }
          };
          recorder.start(250);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const alt = data?.channel?.alternatives?.[0];
            const text: string = alt?.transcript ?? "";
            if (!text.trim()) return;

            const speakerNum = alt?.words?.[0]?.speaker;
            const speaker = typeof speakerNum === "number" ? `Speaker ${speakerNum + 1}` : "Speaker";
            const atMs = Date.now() - startRef.current;

            if (data.is_final) {
              segCounter.current += 1;
              const seg: TranscriptSegment = {
                id: `seg-${segCounter.current}`,
                speaker,
                text: text.trim(),
                atMs,
              };
              setSegments((prev) => [...prev, seg]);
              setInterim("");
            } else {
              setInterim(`${speaker}: ${text}`);
            }
          } catch {
            // Non-JSON or unexpected frame — ignore rather than break the session.
          }
        };

        ws.onerror = () => {
          setError("Transcription connection dropped. You can stop and save what was captured so far.");
        };
      } catch (err) {
        cleanup();
        setStatus("error");
        setError(err instanceof Error ? err.message : "Could not start meeting capture.");
      }
    },
    [cleanup],
  );

  return { status, segments, interim, error, start, stop };
}
