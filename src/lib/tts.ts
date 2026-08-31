/**
 * TTS Jarvis — membacakan teks dengan KARAKTER VOKAL Jarvis (pria Inggris,
 * ala 5-jarvis.mp3) untuk SEMUA bahasa, tanpa pernah pindah ke voice lain.
 *
 * - speak(text): membacakan teks pakai voice Jarvis yang dikunci
 *   (Daniel / Google UK English Male / Microsoft Ryan, dst).
 *   Tidak ada lagi deteksi bahasa → tidak akan suara cewek Indonesia lagi.
 * - playJarvisChime(): memutar 5-jarvis.mp3 HANYA sebagai chime saat agent
 *   mulai menjawab — bukan untuk membacakan teks.
 */

let jarvisAudio: HTMLAudioElement | null = null;

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
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

/** Voice ala Jarvis — urutan prioritas, kunci ke pria Inggris. */
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

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  for (const hint of JARVIS_VOICE_HINTS) {
    const v = voices.find((x) => x.name.includes(hint));
    if (v) return v;
  }
  // fallback: voice Inggris apa pun (jangan pernah voice id/female)
  return voices.find((v) => v.lang.toLowerCase().startsWith("en")) ?? voices[0];
}

function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " (blok kode dilewati). ")
    .replace(/https?:\/\/\S+/g, " (tautan) ")
    .replace(/[*_`#>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function speak(text: string) {
  if (!("speechSynthesis" in window)) return;
  const clean = cleanForSpeech(text).slice(0, 600);
  if (!clean) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(clean);
  const voice = pickVoice();
  if (voice) {
    utter.voice = voice;
    utter.lang = voice.lang;
  } else {
    utter.lang = "en-US";
  }
  utter.rate = 1.02;
  utter.pitch = 0.9;
  synth.speak(utter);
}
