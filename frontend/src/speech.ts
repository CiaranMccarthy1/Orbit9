/**
 * Voice guide: picks a natural English voice and reads text aloud in short phrases.
 *
 * Why phrases? Chromium can stall on long utterances from online voices, and browsers
 * may drop an utterance nothing references. Short phrases plus the keep-alive timer
 * and watchdog below work around both problems.
 *
 * Public API:
 *   - speak(text)          read text, but only when mode is "voice" and audio is unlocked
 *   - previewVoice(text)   read text regardless of mode (used to audition a voice)
 *   - stopSpeaking()       cancel whatever is being said
 *   - cycleVoice()         switch voice; choice is saved to localStorage
 *   - isSpeechSupported    false when the browser has no speechSynthesis
 *
 * The speaking state is mirrored to the guide's mouth via #teacher-mouth.
 */
import { STORAGE_KEYS } from './config';
import { getAudioMode, isAudioUnlocked } from './sound';

const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
export const isSpeechSupported = synth !== null;

const MAX_VOICES = 8; // more than enough to cycle through; keeps the list manageable
const SPEECH_RATE = 0.93;
const MAX_PHRASE_LENGTH = 120;
const SENTENCE_PAUSE_MS = 400;
const CLAUSE_PAUSE_MS = 120;
const KEEP_ALIVE_MS = 10_000;

/* ---------- Choosing a voice ---------- */

/** Novelty voices (robots, whispers, bells…) sound silly, so we skip them. */
const NOVELTY_VOICES =
  /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|ralph|junior|kathy|deranged|hysterical/i;

const FRIENDLY_NAMES =
  /aria|jenny|libby|sonia|ava|samantha|zoe|serena|allison|susan|karen|moira|google uk english female|google us english/i;

/** Higher score = more natural sounding. */
function scoreVoice(voice: SpeechSynthesisVoice): number {
  let score = 0;
  if (/natural|neural/i.test(voice.name)) score += 50;
  if (/premium|enhanced/i.test(voice.name)) score += 40;
  if (/online/i.test(voice.name)) score += 20;
  if (FRIENDLY_NAMES.test(voice.name)) score += 15;
  if (!voice.localService) score += 10;
  if (/^en[-_](US|GB|IE|AU)/i.test(voice.lang)) score += 5;
  return score;
}

let availableVoices: SpeechSynthesisVoice[] = [];
let currentVoice: SpeechSynthesisVoice | null = null;

function readSavedVoiceName(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.voice);
  } catch {
    return null; // storage can be blocked (private mode, strict settings)
  }
}

function saveVoiceName(name: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.voice, name);
  } catch {
    /* Not saving is fine; the choice just won't persist. */
  }
}

function refreshVoices(): void {
  const all = synth?.getVoices() ?? [];
  if (!all.length) return; // the browser has not loaded voices yet

  availableVoices = all
    .filter((voice) => voice.lang.toLowerCase().startsWith('en') && !NOVELTY_VOICES.test(voice.name))
    .sort((a, b) => scoreVoice(b) - scoreVoice(a))
    .slice(0, MAX_VOICES);

  // Keep the current voice if it is still available.
  if (currentVoice && availableVoices.some((voice) => voice.name === currentVoice?.name)) return;

  // Otherwise restore the saved choice, falling back to the best-scoring voice.
  const saved = readSavedVoiceName();
  currentVoice = availableVoices.find((voice) => voice.name === saved) ?? availableVoices[0] ?? null;
}

if (synth) {
  refreshVoices();
  synth.onvoiceschanged = refreshVoices; // voices often load a moment after the page
}

/** Switch to the next voice. Returns its name, or null when no voices exist. */
export function cycleVoice(): string | null {
  if (!availableVoices.length) refreshVoices();
  if (!availableVoices.length) return null;

  const index = availableVoices.findIndex((voice) => voice.name === currentVoice?.name);
  currentVoice = availableVoices[(index + 1) % availableVoices.length];
  saveVoiceName(currentVoice.name);
  return currentVoice.name;
}

/* ---------- Preparing the text ---------- */

/** Respell words that voices tend to mispronounce. */
const PRONUNCIATIONS: [RegExp, string][] = [
  [/Orbit9/g, 'Orbit nine'],
  [/SPHEREx/g, 'Sphere-X'],
  [/IPAC/g, 'eye-pack'],
  [/IRSA/g, 'eye-arr-ess-ay'],
  [/TRAPPIST-1/g, 'Trappist one'],
  [/\bRA\b/g, 'right ascension'],
  [/\bDec\b/g, 'declination'],
  [/\b102\b/g, 'one hundred and two'],
  [/°/g, ' degrees'],
  [/&/g, ' and '],
];

function prepareSpeech(text: string): string {
  // "!" makes some voices sound shouty, so treat it as a full stop.
  return PRONUNCIATIONS.reduce((result, [pattern, spoken]) => result.replace(pattern, spoken), text.replace(/!/g, '.'));
}

interface Phrase {
  text: string;
  pauseAfter: number; // milliseconds of silence before the next phrase
}

/** Split into sentences, and split long sentences at commas. */
function splitIntoPhrases(text: string): Phrase[] {
  const sentences = text.replace(/\s*—\s*/g, ', ').match(/[^.?]+[.?]*/g) ?? [text];
  const phrases: Phrase[] = [];

  for (const sentence of sentences.map((s) => s.trim()).filter(Boolean)) {
    if (sentence.length <= MAX_PHRASE_LENGTH) {
      phrases.push({ text: sentence, pauseAfter: /[.?]$/.test(sentence) ? SENTENCE_PAUSE_MS : 0 });
      continue;
    }
    const clauses = sentence.split(/(?<=[,;:])\s+/);
    clauses.forEach((clause, index) => {
      const isLast = index === clauses.length - 1;
      phrases.push({ text: clause.trim(), pauseAfter: isLast ? SENTENCE_PAUSE_MS : CLAUSE_PAUSE_MS });
    });
  }
  return phrases;
}

/* ---------- Speaking ---------- */

/** Bumped on every stop/start. Callbacks from an older run see a different id and quit. */
let runId = 0;
let pauseTimer: number | undefined;
let keepAliveTimer: number | undefined;
/** Holding a reference stops the browser from garbage-collecting the utterance mid-speech. */
let activeUtterance: SpeechSynthesisUtterance | null = null;

/** The guide SVG reuses this id; a missing element is fine (guide closed or not yet built). */
const setMouthMoving = (moving: boolean) =>
  document.getElementById('teacher-mouth')?.classList.toggle('is-speaking', moving);

export function stopSpeaking(): void {
  runId++;
  window.clearTimeout(pauseTimer);
  window.clearInterval(keepAliveTimer);
  keepAliveTimer = undefined;
  activeUtterance = null;
  synth?.cancel();
  setMouthMoving(false);
}

function say(text: string): void {
  if (!synth) return;

  const wasBusy = synth.speaking || synth.pending;
  stopSpeaking();
  if (!currentVoice) refreshVoices();

  const thisRun = runId;
  const voice = currentVoice; // one voice for the whole passage, even if the list reloads
  const phrases = splitIntoPhrases(prepareSpeech(text));

  const speakPhrase = (index: number): void => {
    if (thisRun !== runId) return; // stopped or replaced by newer speech
    if (index >= phrases.length) {
      activeUtterance = null;
      setMouthMoving(false);
      return;
    }

    const { text: phrase, pauseAfter } = phrases[index];
    const utterance = new SpeechSynthesisUtterance(phrase);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    utterance.rate = SPEECH_RATE;
    activeUtterance = utterance;

    let finished = false;
    let watchdog: number | undefined;

    /** Move on to the next phrase after a pause. Only the first call per phrase counts. */
    const finish = (pauseMs: number): void => {
      if (finished || thisRun !== runId) return;
      finished = true;
      window.clearTimeout(watchdog);
      window.clearInterval(keepAliveTimer);
      keepAliveTimer = undefined;
      setMouthMoving(false);
      pauseTimer = window.setTimeout(() => speakPhrase(index + 1), pauseMs);
    };

    utterance.onstart = () => {
      setMouthMoving(true);
      // Chromium freezes online voices after ~15 s; a pause/resume nudge keeps them going.
      keepAliveTimer = window.setInterval(() => {
        if (synth.speaking && !synth.paused) {
          synth.pause();
          synth.resume();
        }
      }, KEEP_ALIVE_MS);
    };
    utterance.onend = () => finish(pauseAfter);
    utterance.onerror = (event) => {
      if (event.error !== 'canceled' && event.error !== 'interrupted') {
        console.warn('Speech synthesis error:', event.error);
      }
      finish(pauseAfter);
    };

    // Watchdog: if the browser never reports the phrase as finished, skip ahead.
    const timeoutMs = (phrase.length * 150) / SPEECH_RATE + 5000;
    watchdog = window.setTimeout(() => {
      finish(100);
      synth.cancel();
    }, timeoutMs);

    synth.speak(utterance);
  };

  // After cancelling, wait a beat so the browser is ready. Without a cancel, speak at once:
  // iOS only allows speech started straight from a tap.
  if (wasBusy) {
    pauseTimer = window.setTimeout(() => speakPhrase(0), 100);
  } else {
    speakPhrase(0);
  }
}

/** Read text aloud, but only when sound is unlocked and the mode is "voice". */
export function speak(text: string): void {
  if (getAudioMode() !== 'voice' || !isAudioUnlocked()) return;
  say(text);
}

/** Read text aloud regardless of mode. Used to preview a newly chosen voice. */
export function previewVoice(text: string): void {
  say(text);
}
