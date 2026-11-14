/**
 * Chime sound effects and the sound on/off mode.
 *
 * Browsers only allow audio after a user gesture, so unlockAudio() must run
 * from a click/tap handler before playChime() can produce sound. Until then
 * playChime() is a safe no-op (it also stays silent in "muted" mode).
 *
 * Public API:
 *   - getAudioMode() / cycleAudioMode() control voice → chimes → muted
 *   - unlockAudio()                    enables audio after the first gesture
 *   - playChime(frequency, duration)   short UI feedback tone
 */

export type AudioMode = 'voice' | 'sfx' | 'muted';

/** Labels for the sound button, in the order the button cycles through them. */
export const AUDIO_MODE_LABELS: Record<AudioMode, string> = {
  voice: '🔊 Voice & Chimes',
  sfx: '🔔 Chimes Only',
  muted: '🔇 Muted',
};
// Derived from the labels object, so the cycle order always matches the UI text.
const MODE_ORDER = Object.keys(AUDIO_MODE_LABELS) as AudioMode[];

// Start with everything on; the guide still waits for a click before speaking.
let mode: AudioMode = 'voice';
let unlocked = false;
let context: AudioContext | null = null;

export const getAudioMode = () => mode;
export const isAudioUnlocked = () => unlocked;

/** Move to the next mode (voice → chimes → muted → voice). */
export function cycleAudioMode(): AudioMode {
  mode = MODE_ORDER[(MODE_ORDER.indexOf(mode) + 1) % MODE_ORDER.length];
  return mode;
}

/** Call from a click or tap handler. Safe to call many times. */
export function unlockAudio(): void {
  unlocked = true;
  context ??= new AudioContext(); // create once, then reuse for every chime
  if (context.state === 'suspended') void context.resume();
}

/** A soft two-note chime: a sine tone plus a quieter triangle tone a fifth above. */
export function playChime(frequency = 587.33, duration = 0.18): void {
  if (mode === 'muted' || !context) return;

  const audio = context;
  const layers = [
    { pitch: frequency, wave: 'sine', volume: 0.07, delay: 0 },
    { pitch: frequency * 1.5, wave: 'triangle', volume: 0.03, delay: 0.04 },
  ] as const;

  for (const layer of layers) {
    const start = audio.currentTime + layer.delay;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();

    oscillator.type = layer.wave;
    oscillator.frequency.setValueAtTime(layer.pitch, start);
    gain.gain.setValueAtTime(layer.volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration); // fade out

    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + duration);
  }
}
