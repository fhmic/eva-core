import { useCallback, useEffect, useRef, useState } from "react";

type Recognition = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
};

function getRecognition(): Recognition | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null;
  if (!Ctor) return null;
  const r: Recognition = new Ctor();
  r.continuous = true;
  r.interimResults = true;
  r.lang = "en-US";
  return r;
}

const WAKE = /\b(hello|hi|hey|good morning|good day)?\s*eva\b|\beva online\b/i;

/**
 * Continuous listening: stays passive until a wake phrase, then captures
 * commands, returning to passive mode after 30s of silence.
 */
export function useVoice({
  onCommand,
  onWake,
}: {
  onCommand: (text: string) => void;
  onWake: () => void;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [awake, setAwake] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [level, setLevel] = useState(0);

  const recRef = useRef<Recognition | null>(null);
  const awakeRef = useRef(false);
  const listeningRef = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCleanup = useRef<() => void>(() => {});

  useEffect(() => {
    setSupported(!!getRecognition());
  }, []);

  const armIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      awakeRef.current = false;
      setAwake(false);
    }, 30000);
  }, []);

  const startMeter = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let frame = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
        frame = requestAnimationFrame(tick);
      };
      tick();
      audioCleanup.current = () => {
        cancelAnimationFrame(frame);
        stream.getTracks().forEach((t) => t.stop());
        ctx.close();
        setLevel(0);
      };
    } catch {
      /* mic metering is optional */
    }
  }, []);

  const stop = useCallback(() => {
    listeningRef.current = false;
    setListening(false);
    setAwake(false);
    awakeRef.current = false;
    recRef.current?.stop();
    recRef.current = null;
    audioCleanup.current();
    audioCleanup.current = () => {};
    setTranscript("");
  }, []);

  const start = useCallback(async () => {
    const rec = getRecognition();
    if (!rec) return;
    recRef.current = rec;
    listeningRef.current = true;
    setListening(true);
    await startMeter();

    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0].transcript as string;
        if (res.isFinal) {
          const clean = text.trim();
          if (!clean) continue;
          if (!awakeRef.current) {
            if (WAKE.test(clean)) {
              awakeRef.current = true;
              setAwake(true);
              armIdle();
              const after = clean.replace(/^.*?\beva\b[,.!?]?\s*/i, "").trim();
              if (after.length > 2) onCommand(after);
              else onWake();
            }
          } else {
            armIdle();
            onCommand(clean);
          }
          setTranscript("");
        } else {
          interim += text;
        }
      }
      if (interim) setTranscript(interim);
    };
    rec.onerror = () => {};
    rec.onend = () => {
      if (listeningRef.current) {
        try {
          rec.start();
        } catch {
          /* already starting */
        }
      }
    };
    try {
      rec.start();
    } catch {
      /* ignore */
    }
  }, [armIdle, onCommand, onWake, startMeter]);

  useEffect(() => () => stop(), [stop]);

  return { supported, listening, awake, transcript, level, start, stop };
}

/** Calm, measured female executive-assistant voice. */
export function speak(text: string, onEnd?: () => void) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const clean = text.replace(/[*_`#>]/g, "").slice(0, 1200);
  const u = new SpeechSynthesisUtterance(clean);
  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find((v) => /samantha|serena|female|aria|jenny|zira|sonia/i.test(v.name)) ??
    voices.find((v) => v.lang?.startsWith("en"));
  if (preferred) u.voice = preferred;
  u.rate = 0.92;
  u.pitch = 1.02;
  u.onend = () => onEnd?.();
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
}
