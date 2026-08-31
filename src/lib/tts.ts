let jarvisAudio: HTMLAudioElement | null = null;

export function playJarvisChime() {
  try {
    if (!jarvisAudio) jarvisAudio = new Audio("/5-jarvis.mp3");
    jarvisAudio.currentTime = 0;
    jarvisAudio.volume = 0.5;
    void jarvisAudio.play().catch(() => {});
  } catch {
    /* autoplay diblokir — abaikan */
  }
}

export function stopSpeaking() {
  try {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

const EN_MALE_VOICE_HINTS = [
  "Daniel",
  "Google UK English Male",
  "Microsoft Ryan",
  "Microsoft George",
  "Arthur",
  "Oliver",
  "Google US English",
];

const ID_MARKERS =
  /(^|\s)(yang|dan|di|ke|dari|untuk|dengan|tidak|sudah|akan|bisa|adalah|kami|saya|anda|juga|pada|atau|ini|itu|telah|harus|ada)(\s|$|[.,!?])/i;

function pickVoice(preferEnglish: boolean): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  if (preferEnglish) {
    for (const hint of EN_MALE_VOICE_HINTS) {
      const v = voices.find((x) => x.name.includes(hint));
      if (v) return v;
    }
    return voices.find((v) => v.lang.toLowerCase().startsWith("en")) ?? null;
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

export function speak(text: string) {
  if (!("speechSynthesis" in window)) return;
  const clean = cleanForSpeech(text).slice(0, 600);
  if (!clean) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(clean);
  const preferEnglish = !ID_MARKERS.test(clean);
  const voice = pickVoice(preferEnglish);
  if (voice) {
    utter.voice = voice;
    utter.lang = voice.lang;
  } else {
    utter.lang = preferEnglish ? "en-US" : "id-ID";
  }
  utter.rate = 1.02;
  utter.pitch = 0.9;
  synth.speak(utter);
}
