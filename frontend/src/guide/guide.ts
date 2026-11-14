/**
 * The intro guide dialog: steps, clickable hotspots, sound and voice controls.
 *
 * Where things live:
 *   - lesson text and hotspots   lessons.ts
 *   - markup and element ids     index.html
 *   - chimes and audio mode      ../sound.ts
 *   - voice selection/speaking   ../speech.ts
 *
 * Gotcha: `el` below looks up every id when the module loads, so the markup
 * must already exist. main.ts is a deferred module, so it does. Renaming an
 * id in index.html means updating this file too; byId() throws if it is missing.
 */
import { byId } from '../dom';
import { STORAGE_KEYS } from '../config';
import { AUDIO_MODE_LABELS, cycleAudioMode, getAudioMode, playChime, unlockAudio } from '../sound';
import { cycleVoice, isSpeechSupported, previewVoice, speak, stopSpeaking } from '../speech';
import { lessons, type Hotspot } from './lessons';

/** Chime pitches (Hz), named by what the visitor just did. */
const CHIME = { start: 660, next: 659.25, back: 493.88, dot: 523.25, listen: 587.33, hotspot: 784, close: 440 } as const;

const el = {
  app: byId('app'),
  modal: byId('guide-modal'),
  startScreen: byId('start-screen'),
  startAvatar: byId('start-avatar'),
  startButton: byId('start-guide'),
  startSkip: byId('start-skip'),
  replay: byId('replay-guide'),
  skip: byId('skip-guide'),
  sound: byId('toggle-sound'),
  voice: byId('change-voice'),
  listen: byId('speak-step'),
  prev: byId<HTMLButtonElement>('prev-step'),
  next: byId<HTMLButtonElement>('next-step'),
  dots: byId('step-dots'),
  badge: byId('step-badge'),
  title: byId('step-title'),
  text: byId('step-text'),
  bubble: byId('speech-bubble'),
  scene: byId('scene-canvas'),
  progress: byId('step-progress'),
  hotspotTag: byId('hotspot-tag'),
  hotspotTitle: byId('hotspot-title'),
  hotspotBody: byId('hotspot-body'),
  audioHint: byId('audio-hint'),
};

const lastStep = lessons.length - 1;
let currentStep = 0;

/* ---------- Rendering ---------- */

function hotspotButtonHtml(hotspot: Hotspot): string {
  return `
    <button type="button" data-hotspot="${hotspot.id}" style="left:${hotspot.x};top:${hotspot.y}"
      class="group absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border border-emerald-400 bg-slate-950/90 px-3 py-1 text-xs font-medium text-emerald-300 shadow-lg transition hover:scale-105 hover:bg-emerald-400 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-emerald-400">
      <span class="h-2 w-2 rounded-full bg-emerald-400 group-hover:bg-slate-950 motion-safe:animate-ping"></span>
      <span>${hotspot.label}</span>
    </button>`;
}

function renderDots(): void {
  el.dots.innerHTML = lessons
    .map((_, index) => {
      const isCurrent = index === currentStep;
      const look = isCurrent ? 'w-7 bg-emerald-400' : 'w-2.5 bg-slate-700 hover:bg-slate-500';
      return `<button type="button" data-dot="${index}" aria-label="Go to step ${index + 1}"
        ${isCurrent ? 'aria-current="step"' : ''} class="h-2.5 rounded-full transition-all ${look}"></button>`;
    })
    .join('');
}

function showHotspotInfo(hotspot: Hotspot): void {
  el.hotspotTag.textContent = hotspot.tag;
  el.hotspotTitle.textContent = hotspot.title;
  el.hotspotBody.textContent = hotspot.body;
}

function renderStep(index: number, narrate = true): void {
  currentStep = Math.max(0, Math.min(lastStep, index));
  const lesson = lessons[currentStep];

  el.progress.style.width = `${((currentStep + 1) / lessons.length) * 100}%`;
  el.badge.textContent = `Step ${currentStep + 1} of ${lessons.length}`;
  el.title.textContent = lesson.title;
  el.text.textContent = lesson.speech;

  // Replay the pop-in animation: remove the class, force a reflow, add it back.
  el.bubble.classList.remove('animate-bubble-pop');
  void el.bubble.offsetWidth;
  el.bubble.classList.add('animate-bubble-pop');

  el.scene.innerHTML = `<div class="relative h-full w-full">${lesson.sceneHtml}${lesson.hotspots.map(hotspotButtonHtml).join('')}</div>`;
  showHotspotInfo(lesson.hotspots[0]);
  renderDots();

  el.prev.disabled = currentStep === 0;
  el.prev.classList.toggle('opacity-40', currentStep === 0);
  el.next.textContent = currentStep === lastStep ? 'Enter Sky Map →' : 'Next →';

  if (narrate) speak(lesson.speech);
}

function updateSoundButton(): void {
  const mode = getAudioMode();
  el.sound.textContent = AUDIO_MODE_LABELS[mode];
  el.sound.setAttribute('aria-pressed', String(mode !== 'muted'));
}

/* ---------- Opening and closing ---------- */

function startGuide(): void {
  el.startScreen.hidden = true;
  playChime(CHIME.start, 0.14);
  renderStep(0);
  el.next.focus();
}

function openGuide({ showStartScreen }: { showStartScreen: boolean }): void {
  el.modal.hidden = false;
  el.app.inert = true; // keeps keyboard and screen readers inside the dialog
  document.body.classList.add('overflow-hidden');

  if (showStartScreen) {
    // Wait for a "Play" click so the first sound starts from a real user gesture.
    stopSpeaking();
    renderStep(0, false);
    el.startScreen.hidden = false;
    el.startButton.focus();
  } else {
    startGuide();
  }
}

function closeGuide(): void {
  try { localStorage.setItem(STORAGE_KEYS.guideSeen, '1'); } catch { /* Storage may be unavailable. */ }
  stopSpeaking();
  playChime(CHIME.close, 0.12);
  el.startScreen.hidden = true;
  el.modal.hidden = true;
  el.app.inert = false;
  document.body.classList.remove('overflow-hidden');
  el.replay.focus();
}

/* ---------- Wiring ---------- */

export function initGuide(): void {
  // Reuse the animated guide character on the start screen (copies must not repeat ids).
  const avatarCopy = byId('teacher-avatar').cloneNode(true) as SVGElement;
  avatarCopy.removeAttribute('id');
  avatarCopy.querySelector('#teacher-mouth')?.removeAttribute('id');
  el.startAvatar.append(avatarCopy);

  // Capture phase: runs before any other click handler inside the dialog,
  // so audio is always unlocked by the time a handler wants to make sound.
  el.modal.addEventListener(
    'click',
    () => {
      unlockAudio();
      el.audioHint.textContent = 'Audio ready';
    },
    { capture: true },
  );

  // One listener per container ("event delegation") survives re-rendering.
  el.scene.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-hotspot]');
    const hotspot = lessons[currentStep].hotspots.find((h) => h.id === button?.dataset.hotspot);
    if (!hotspot) return;
    showHotspotInfo(hotspot);
    playChime(CHIME.hotspot, 0.16);
    speak(`${hotspot.title}. ${hotspot.body}`);
  });

  el.dots.addEventListener('click', (event) => {
    const dot = (event.target as HTMLElement).closest<HTMLElement>('[data-dot]');
    if (!dot) return;
    playChime(CHIME.dot, 0.12);
    renderStep(Number(dot.dataset.dot));
  });

  el.prev.addEventListener('click', () => {
    playChime(CHIME.back, 0.12);
    renderStep(currentStep - 1);
  });

  el.next.addEventListener('click', () => {
    if (currentStep === lastStep) return closeGuide();
    playChime(CHIME.next, 0.12);
    renderStep(currentStep + 1);
  });

  el.listen.addEventListener('click', () => {
    playChime(CHIME.listen, 0.12);
    speak(lessons[currentStep].speech);
  });

  el.sound.addEventListener('click', () => {
    const mode = cycleAudioMode();
    updateSoundButton();
    if (mode === 'voice') {
      playChime(CHIME.start, 0.16);
      speak(lessons[currentStep].speech);
    } else {
      stopSpeaking();
      if (mode === 'sfx') playChime(CHIME.listen, 0.16);
    }
  });

  if (isSpeechSupported) {
    el.voice.hidden = false;
    el.voice.addEventListener('click', () => {
      const name = cycleVoice();
      if (!name) return;
      const friendlyName = name.replace(/Microsoft |Google |Online|\(.*?\)/g, '').trim();
      el.voice.title = `Current voice: ${name}`;
      playChime(CHIME.start, 0.12);
      previewVoice(`Hi, I'm ${friendlyName}. Ready to explore the sky together?`);
    });
  }

  el.startButton.addEventListener('click', startGuide);
  el.startSkip.addEventListener('click', closeGuide);
  el.skip.addEventListener('click', closeGuide);
  el.replay.addEventListener('click', () => {
    unlockAudio(); // this button is outside the dialog, so the capture listener won't run
    openGuide({ showStartScreen: false });
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !el.modal.hidden) closeGuide();
  });

  updateSoundButton();
  try {
    if (!localStorage.getItem(STORAGE_KEYS.guideSeen)) openGuide({ showStartScreen: true });
  } catch {
    openGuide({ showStartScreen: true });
  }
}
