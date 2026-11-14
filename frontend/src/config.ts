/**
 * Central settings. Change a value here and it updates everywhere.
 *
 * Nothing here comes from environment variables or the build. These are
 * plain constants, so a teammate can retune the page by editing this file
 * alone (brand name, survey, starting view, storage keys).
 */

/** Project and team name shown in text and spoken by the voice guide. */
export const BRAND = 'Orbit9';

/** Page that opens when a visitor chooses "Open in Explorer". */
export const EXPLORER_PATH = '/explorer';

/**
 * Background sky survey: allWISE color on the ESASky mirror.
 * The CDS master URL currently returns its "Page unavailable" 404, and Aladin
 * takes the first URL from MOCServer, so give it the working mirror directly.
 */
export const SKY_SURVEY = 'https://skies.esac.esa.int/AllWISEColor';

/**
 * Where the sky map starts: a wide view near the Galactic Centre.
 * `target` is an Aladin coordinate string, "ra dec" in degrees.
 */
export const MAP_START = { fov: 120, target: '266.4 -28.9' } as const;

/** A pointer that moves further than this between press and release counts as a drag, not a click. */
export const DRAG_THRESHOLD_PX = 6;

/** localStorage keys, kept together so they never collide. */
export const STORAGE_KEYS = {
  voice: 'orbit9-voice',
  authToken: 'orbit9-token',
} as const;
