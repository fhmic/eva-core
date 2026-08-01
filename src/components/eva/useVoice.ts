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
  const Ctor = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null;
  if (!Ctor) return null;
  const r: Recognition = new Ctor();
  r.continuous = true;
  r.interimResults = true;
  r.lang = "en-US";
  return r;
}

const WAKE =
  /\b(?:hello|hi|hey|ok|okay|good morning|good day|good evening)?\s*(?:eva|ava|eve|iva)\b|\b(?:eva|ava)\s+online\b/i;

/** Phrases Eva herself says — never treat an echo of them as a directive. */
const SELF_ECHO =
  /^(good day felix|eva online|i'?m online|standing by|playback (paused|stopped)|resuming playback|volume set to)/i;

/**
 * Continuous listening: passive until a wake phrase, then captures commands and
 * returns to passive mode after 30s of silence. While Eva speaks, recognition is
 * suspended so she never hears her own voice.
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
  const suspendedRef = useRef(false);
  const guardUntil = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCleanup = useRef<() => void>(() => {});

  useEffect(() => {
    setSupported(!!getRecognition());
    primeVoices();
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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
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
        void ctx.close();
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
    suspendedRef.current = false;
    recRef.current?.stop();
    recRef.current = null;
    audioCleanup.current();
    audioCleanup.current = () => {};
    setTranscript("");
  }, []);

  const start = useCallback(async () => {
    if (listeningRef.current) return;
    const rec = getRecognition();
    if (!rec) return;
    recRef.current = rec;
    listeningRef.current = true;
    setListening(true);
    await startMeter();

    rec.onresult = (e: any) => {
      if (suspendedRef.current || Date.now() < guardUntil.current) return;
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0].transcript as string;
        if (res.isFinal) {
          const clean = text.trim();
          if (!clean || SELF_ECHO.test(clean)) continue;
          if (!awakeRef.current) {
            if (WAKE.test(clean)) {
              awakeRef.current = true;
              setAwake(true);
              armIdle();
              const after = clean.replace(/^.*?\b(?:eva|ava|eve|iva)\b[,.!?]?\s*/i, "").trim();
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
      setTranscript(interim);
    };
    rec.onerror = () => {};
    rec.onend = () => {
      if (listeningRef.current && !suspendedRef.current) {
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

  /** Halt recognition while Eva speaks so the mic never hears her reply. */
  const suspend = useCallback(() => {
    if (!listeningRef.current || suspendedRef.current) return;
    suspendedRef.current = true;
    setTranscript("");
    try {
      recRef.current?.abort();
    } catch {
      /* ignore */
    }
  }, []);

  const resume = useCallback(() => {
    if (!suspendedRef.current) return;
    suspendedRef.current = false;
    if (!listeningRef.current) return;
    // Ignore whatever tail of her own audio the mic buffered.
    guardUntil.current = Date.now() + 600;
    setTimeout(() => {
      if (!listeningRef.current || suspendedRef.current) return;
      try {
        recRef.current?.start();
      } catch {
        /* already running */
      }
    }, 250);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { supported, listening, awake, transcript, level, start, stop, suspend, resume };
}

/* ------------------------- speech synthesis ------------------------- */

const FEMALE = [
  "samantha",
  "serena",
  "victoria",
  "karen",
  "moira",
  "tessa",
  "fiona",
  "allison",
  "ava",
  "susan",
  "zira",
  "aria",
  "jenny",
  "sonia",
  "libby",
  "natasha",
  "clara",
  "google uk english female",
  "google us english",
  "female",
  "woman",
];

const MALE =
  /\b(male|man|daniel|alex|fred|george|guy|david|mark|ryan|thomas|oliver|james|rishi|arthur|gordon|lee|liam|junior|aaron|eddy|reed|rocko|grandpa|bruce|nathan|william|matthew|jacques|diego|carlos|nicolas)\b/i;

let cachedVoice: SpeechSynthesisVoice | null = null;

function scoreVoice(v: SpeechSynthesisVoice) {
  const name = v.name.toLowerCase();
  if (MALE.test(name)) return -1;
  let score = 0;
  if (FEMALE.some((f) => name.includes(f))) score += 10;
  if (/female/.test(name)) score += 4;
  if (v.lang?.toLowerCase().startsWith("en")) score += 3;
  if (/en-gb/i.test(v.lang ?? "")) score += 1;
  if (v.localService) score += 1;
  return score;
}

/** Resolve — and lock in — a single female English voice for Eva. */
export function evaVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  if (cachedVoice) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const ranked = voices
    .map((v) => ({ v, s: scoreVoice(v) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  cachedVoice = ranked[0]?.v ?? voices.find((v) => v.lang?.startsWith("en")) ?? voices[0] ?? null;
  return cachedVoice;
}

/** Warm the voice list up-front so the first utterance is never a default male voice. */
export function primeVoices() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  evaVoice();
  window.speechSynthesis.addEventListener?.("voiceschanged", () => {
    cachedVoice = null;
    evaVoice();
  });
}

/** Calm, measured female executive-assistant voice. */
export function speak(text: string, onEnd?: () => void) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const clean = text.replace(/[*_`#>]/g, "").slice(0, 1200);

  const utter = () => {
    const u = new SpeechSynthesisUtterance(clean);
    const voice = evaVoice();
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    }
    u.rate = 0.94;
    u.pitch = 1.12;
    u.onend = () => onEnd?.();
    u.onerror = () => onEnd?.();
    window.speechSynthesis.speak(u);
  };

  // If the voice list hasn't loaded yet, wait for it rather than speaking with
  // the platform default (which is often male).
  if (!evaVoice()) {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      cachedVoice = null;
      utter();
    };
    window.speechSynthesis.addEventListener?.("voiceschanged", go, { once: true });
    setTimeout(go, 500);
    return;
  }
  utter();
}

export function stopSpeaking() {
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
}
