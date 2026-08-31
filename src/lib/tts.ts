/**
 * TTS Jarvis — SEMUA suara memakai file /5-jarvis.mp3, di semua kondisi.
 * Tidak ada lagi speechSynthesis browser (itu penyebab suara cewek
 * saat teks bahasa Indonesia). Satu suara untuk semuanya: sapaan
 * pembuka, balasan chat agent, dan chime saat agent mulai menjawab.
 */

let jarvisAudio: HTMLAudioElement | null = null;

function getAudio(): HTMLAudioElement {
  if (!jarvisAudio) {
    jarvisAudio = new Audio("/5-jarvis.mp3");
    jarvisAudio.volume = 0.5;
  }
  return jarvisAudio;
}

/** Mainkan suara Jarvis (5-jarvis.mp3). Dipakai untuk SEMUA kondisi. */
export function playJarvisVoice() {
  try {
    const a = getAudio();
    a.currentTime = 0;
    void a.play().catch(() => {
      /* autoplay diblokir — akan diputar saat interaksi berikutnya */
    });
  } catch {
    /* ignore */
  }
}

/** Alias kompatibilitas: chime saat agent mulai menjawab = suara Jarvis juga. */
export const playJarvisChime = playJarvisVoice;

/**
 * Kompatibilitas dengan pemanggilan lama: dulu ini membacakan teks
 * pakai speechSynthesis. Sekarang SELALU memutar 5-jarvis.mp3,
 * apa pun isi teksnya (Bahasa Indonesia / Inggris / kode).
 */
export function speak() {
  playJarvisVoice();
}

export function stopSpeaking() {
  try {
    if (jarvisAudio) jarvisAudio.pause();
  } catch {
    /* ignore */
  }
}
