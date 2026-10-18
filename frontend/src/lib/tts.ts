// Text-to-speech on the phone's own voice. Plays even with the silent switch on.
//
//   prepareTTS();                                  // optional: call once so the first speak() has no setup delay
//   speak('Hello there!');                         // fire and forget
//   const result = await speak('Hi');              // 'done' | 'stopped' | 'error'
//   stopSpeaking();                                // cut off current speech

import * as Speech from 'expo-speech';
import { setAudioModeAsync } from 'expo-audio';

export type SpeakResult = 'done' | 'stopped' | 'error';

export type SpeakOptions = {
  /** Called only when the text finished playing naturally (not when stopped). */
  onDone?: () => void;
  /** Stop whatever is currently speaking before starting. Default: true. */
  interrupt?: boolean;
  /** Speaking speed. 1.0 is normal. Default: 1.0. */
  rate?: number;
};

const LANGUAGE = 'en-US';

// Configure the audio session once so speech plays even with the silent switch on.
let audioModeReady: Promise<void> | null = null;

function ensureAudioMode(): Promise<void> {
  if (!audioModeReady) {
    audioModeReady = setAudioModeAsync({ playsInSilentMode: true }).catch((err) => {
      audioModeReady = null; // allow a retry on the next call
      console.warn('[tts] Could not enable silent-mode playback:', err);
    });
  }
  return audioModeReady;
}

/** Optional warm-up. Call once so the first speak() has no setup delay. */
export function prepareTTS(): Promise<void> {
  return ensureAudioMode();
}

/** Speak text. Resolves when speech finishes, is stopped, or fails. */
export async function speak(text: string, options: SpeakOptions = {}): Promise<SpeakResult> {
  const { onDone, interrupt = true, rate = 1.0 } = options;

  const trimmed = text?.trim();
  if (!trimmed) return 'done';

  if (trimmed.length > Speech.maxSpeechInputLength) {
    console.warn(`[tts] Text is longer than ${Speech.maxSpeechInputLength} characters and may be cut off.`);
  }

  await ensureAudioMode();
  if (interrupt) await Speech.stop();

  return new Promise<SpeakResult>((resolve) => {
    Speech.speak(trimmed, {
      language: LANGUAGE,
      rate,
      useApplicationAudioSession: true, // use the silent-mode session set above
      onDone: () => {
        onDone?.();
        resolve('done');
      },
      onStopped: () => resolve('stopped'),
      onError: (err) => {
        console.warn('[tts] Speech error:', err);
        resolve('error');
      },
    });
  });
}

/** Stop any speech that is currently playing. */
export function stopSpeaking(): Promise<void> {
  return Speech.stop();
}

/** True if something is currently being spoken. */
export function isSpeaking(): Promise<boolean> {
  return Speech.isSpeakingAsync();
}
