/**
 * Lesson content for the intro guide. This file is data only: edit the text
 * below and the dialog updates automatically. No other file needs to change.
 *
 * To add a lesson: append an object to `lessons`. `speech` is shown in the
 * bubble and read aloud; `sceneHtml` is the picture; each hotspot needs a
 * unique `id` within its lesson, and x/y are percentages from the scene's
 * top-left. Keep speech short and friendly because it is spoken in phrases.
 *
 * Note: sceneHtml is rendered as-is from this trusted file, so never build it
 * from user input without escaping.
 */
import { BRAND } from '../config';

/** A clickable marker on a lesson's scene. x and y are percentages from the top-left. */
export interface Hotspot {
  id: string; // must be unique within its lesson
  x: string;
  y: string;
  label: string; // text on the marker button
  tag: string; // small badge in the info card
  title: string;
  body: string;
}

export interface Lesson {
  title: string;
  speech: string; // shown in the speech bubble and read aloud
  sceneHtml: string; // picture for this step (Tailwind classes work here)
  hotspots: Hotspot[];
}

/** Heights (%) and colours of the six bars in lesson 2: one per SPHEREx detector array. */
const INFRARED_BARS = [
  { height: 38, color: 'bg-sky-400/50' },
  { height: 52, color: 'bg-teal-400/60' },
  { height: 68, color: 'bg-emerald-400/75' },
  { height: 60, color: 'bg-emerald-400/85' },
  { height: 82, color: 'bg-amber-400/85' },
  { height: 96, color: 'bg-rose-400/90' },
];

const infraredBars = INFRARED_BARS.map(
  ({ height, color }) => `<div class="flex-1 rounded-t-lg ${color}" style="height:${height}%"></div>`,
).join('');

export const lessons: Lesson[] = [
  {
    title: 'Every Star Has a Sky Address',
    speech: `Welcome to ${BRAND}! Just like a map of Earth uses latitude and longitude, astronomers use sky coordinates to pinpoint every star. Tap a glowing star to compare them.`,
    sceneHtml: `
      <div class="star-field relative h-full w-full">
        <div class="absolute left-[28%] top-[44%] h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400 shadow-[0_0_38px_12px_rgba(56,189,248,0.6)] motion-safe:animate-star-breathe"></div>
        <div class="absolute left-[68%] top-[56%] h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 shadow-[0_0_26px_9px_rgba(239,68,68,0.55)] motion-safe:animate-star-breathe"></div>
      </div>`,
    hotspots: [
      {
        id: 'hot-star',
        x: '28%',
        y: '44%',
        label: 'Blue Giant Star',
        tag: 'Hot & Bright',
        title: 'Massive Blue Stars',
        body: 'These rare giants burn super hot and shine fiercely in blue light, lighting up nearby clouds of space gas.',
      },
      {
        id: 'red-dwarf',
        x: '68%',
        y: '56%',
        label: 'Red Dwarf Star',
        tag: 'Small & Common',
        title: 'Cool Red Dwarfs',
        body: 'Red dwarfs are smaller and cooler than our Sun, making them the easiest stars to spot rocky planets around.',
      },
    ],
  },
  {
    title: 'Seeing Invisible Infrared Light',
    speech: 'Space dust blocks regular cameras, so NASA’s SPHEREx telescope sees in 102 shades of invisible infrared light. That lets us peek straight through dusty clouds!',
    sceneHtml: `
      <div class="flex h-full w-full items-end gap-2.5 bg-slate-950 px-8 pb-8 pt-14" aria-hidden="true">
        ${infraredBars}
      </div>`,
    hotspots: [
      {
        id: 'infrared-colors',
        x: '32%',
        y: '52%',
        label: '102 Infrared Shades',
        tag: 'NASA SPHEREx Camera',
        title: 'More Colors Than Human Eyes Can See',
        body: 'Each color reveals a hidden clue, like how warm an object is or what gases and ices surround a young star.',
      },
      {
        id: 'whole-sky',
        x: '72%',
        y: '40%',
        label: 'Full-Sky Map',
        tag: 'Every 6 Months',
        title: 'Scanning the Entire Sky',
        body: 'Unlike telescopes that zoom into one tiny spot, NASA’s SPHEREx maps the entire night sky every six months.',
      },
    ],
  },
  {
    title: 'Searching for Water & New Worlds',
    speech: 'How do we find places where planets could form? SPHEREx scans swirling rings of dust around young stars to spot frozen water and gases, the building blocks of life!',
    sceneHtml: `
      <svg viewBox="0 0 400 220" class="h-full w-full bg-slate-950" aria-hidden="true">
        <ellipse cx="200" cy="110" rx="145" ry="44" fill="none" stroke="#334155" stroke-width="10" stroke-opacity="0.45" />
        <ellipse cx="200" cy="110" rx="115" ry="32" fill="none" stroke="#34d399" stroke-dasharray="4 6" />
        <circle cx="200" cy="110" r="24" fill="#fbbf24" />
        <circle cx="200" cy="110" r="36" fill="#fbbf24" fill-opacity="0.16" />
        <g>
          <circle cx="315" cy="110" r="7" fill="#38bdf8" />
          <animateTransform attributeName="transform" type="rotate" from="0 200 110" to="360 200 110" dur="10s" repeatCount="indefinite" />
        </g>
      </svg>`,
    hotspots: [
      {
        id: 'water-ice',
        x: '50%',
        y: '50%',
        label: 'Frozen Water',
        tag: 'Planet Ingredients',
        title: 'Spotting Water Ice Around Young Stars',
        body: 'Tiny ice grains trapped in space dust leave a clear infrared fingerprint, showing where future oceans could form.',
      },
      {
        id: 'moving-objects',
        x: '78%',
        y: '50%',
        label: 'Orbiting Worlds',
        tag: 'Spot What Moves',
        title: 'Planets & Warm Brown Dwarfs',
        body: 'By comparing sky snapshots taken months apart, astronomers see nearby objects move while distant stars stay still.',
      },
    ],
  },
  {
    title: 'Your Turn to Explore!',
    speech: 'Now you’re ready! Close this guide and click anywhere on our sky map to drop a pin and inspect real NASA data for that exact spot.',
    sceneHtml: `
      <div class="relative h-full w-full bg-slate-950"
        style="background-image:linear-gradient(#1e293b 1px,transparent 1px),linear-gradient(90deg,#1e293b 1px,transparent 1px);background-size:36px 36px">
        <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <div class="mx-auto mb-2 h-8 w-8 rounded-full bg-emerald-400/20 p-1.5">
            <div class="h-full w-full rounded-full bg-emerald-400"></div>
          </div>
          <p class="text-xs font-medium text-emerald-300">Click “Enter Sky Map” below to begin</p>
        </div>
      </div>`,
    hotspots: [
      {
        id: 'drop-pin',
        x: '50%',
        y: '50%',
        label: 'How the Map Works',
        tag: '1-Click Discovery',
        title: 'Click Anywhere on the Sky',
        body: 'Dropping a pin grabs that spot’s sky coordinates and opens NASA’s infrared telescope data in the Explorer.',
      },
    ],
  },
];
