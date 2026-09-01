/**
 * TTS Jarvis — ElevenLabs utama, browser TTS sebagai fallback.
 *
 * speak(text):
 * 1. POST /api/tts (server memanggil ElevenLabs, voice George — British male
 *    ala Jarvis, multilingual: ID & EN natural). Key hanya di server.
 * 2. Kalau ElevenLabs gagal/quota habis → fallback ke speechSynthesis browser
 *    dengan pembacaan bilingual per-kalimat (voice Jarvis untuk EN,
 *    voice ID pria untuk ID).
 *
 * playJarvisChime(): 5-jarvis.mp3 HANYA sebagai chime saat agent mulai menjawab.
 */

let jarvisAudio: HTMLAudioElement | null = null;
let ttsAudio: HTMLAudioElement | null = null;

export function playJarvisChime() {
  try {
    if (!jarvisAudio) jarvisAudio = new Audio("/5-jarvis.mp3");
    jarvisAudio.currentTime = 0;
    jarvisAudio.volume = 0.5;
    void jarvisAudio.play().catch(() => {
      /* autoplay diblokir — abaikan */
    });
  } catch {
    /* ignore */
  }
}

export function stopSpeaking() {
  try {
    ttsAudio?.pause();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

/** Voice ala Jarvis — pria Inggris. */
const JARVIS_VOICE_HINTS = [
  "Daniel",
  "Google UK English Male",
  "Microsoft Ryan",
  "Microsoft George",
  "Arthur",
  "Oliver",
  "Microsoft Guy",
  "Google US English",
];

/** Voice Bahasa Indonesia — prioritas pria agar karakter tetap "Jarvis". */
const ID_VOICE_HINTS = ["Ardi", "Andika", "Google Bahasa Indonesia", "Indonesian"];

function getVoices(): SpeechSynthesisVoice[] {
  return "speechSynthesis" in window ? window.speechSynthesis.getVoices() : [];
}

function pickJarvisVoice(): SpeechSynthesisVoice | null {
  const voices = getVoices();
  if (!voices.length) return null;
  for (const hint of JARVIS_VOICE_HINTS) {
    const v = voices.find((x) => x.name.includes(hint));
    if (v) return v;
  }
  return voices.find((v) => v.lang.toLowerCase().startsWith("en")) ?? voices[0];
}

function pickIdVoice(): SpeechSynthesisVoice | null {
  const voices = getVoices();
  if (!voices.length) return null;
  for (const hint of ID_VOICE_HINTS) {
    const v = voices.find((x) => x.name.includes(hint));
    if (v) return v;
  }
  return voices.find((v) => v.lang.toLowerCase().startsWith("id")) ?? null;
}

function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " (blok kode dilewati). ")
    .replace(/https?:\/\/\S+/g, " (tautan) ")
    .replace(/[*_`#>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Kata kunci penanda Bahasa Indonesia. */
const ID_WORD =
  /(^|\s)(yang|dan|adalah|tidak|sudah|akan|bisa|untuk|dengan|kami|saya|anda|juga|pada|atau|ini|itu|telah|harus|kok|jangan|banyak|karena|kalau|jika|semua|belum|masih|dari)([\s.,!?]|$)/i;

function detectLang(sentence: string): "id" | "en" {
  return ID_WORD.test(sentence) ? "id" : "en";
}

/** Pecah jadi kalimat — tanpa regex lookbehind (kompatibel Safari lama). */
function splitSentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text])
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Fallback: speechSynthesis browser, bilingual per-kalimat. */
function speakBrowser(text: string) {
  if (!("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const jarvis = pickJarvisVoice();
  const idVoice = pickIdVoice();
  const sentences = splitSentences(text).slice(0, 40);
  if (!sentences.length) return;

  for (const sentence of sentences) {
    const isId = detectLang(sentence) === "id";
    const voice = isId ? idVoice ?? jarvis : jarvis;
    const utter = new SpeechSynthesisUtterance(sentence);
    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang;
    } else {
      utter.lang = isId ? "id-ID" : "en-US";
    }
    utter.rate = 1.02;
    utter.pitch = 0.9;
    synth.speak(utter);
  }
}

async function speakElevenLabs(text: string): Promise<boolean> {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      cache: "no-store",
    });
    if (!res.ok) return false;
    const blob = await res.blob();
    if (!blob.type.startsWith("audio")) return false;
    if (!ttsAudio) ttsAudio = new Audio();
    ttsAudio.src = URL.createObjectURL(blob);
    ttsAudio.volume = 1;
    await ttsAudio.play();
    return true;
  } catch {
    return false;
  }
}

export async function speak(text: string) {
  const clean = cleanForSpeech(text).slice(0, 900);
  if (!clean) return;
  stopSpeaking();
  const ok = await speakElevenLabs(clean);
  if (!ok) speakBrowser(clean);
}
