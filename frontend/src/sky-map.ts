/**
 * The all-sky infrared map (Aladin Lite v3).
 *
 * Interaction:
 *   - Click empty sky       → drop/move a pin and reveal the Explorer link
 *   - Click the pin or link → open the Explorer at that RA/Dec
 *
 * Aladin loads asynchronously. If its script or survey tiles are blocked,
 * catch() swaps in a fallback message and a plain Explorer link.
 */
import { DRAG_THRESHOLD_PX, EXPLORER_PATH, MAP_START, SKY_SURVEY } from './config';
import { byId } from './dom';
import { buildExplorerUrl } from './urlState';
import { showSpherexImages } from './spherex';
import { surveyReachable } from './survey';

/** Default FoV (deg) passed to Explorer so it starts inside the <= 1.0° SPHEREx LoD threshold. */
const EXPLORER_DEFAULT_FOV = 0.5;

/** Draws a teardrop pin whose tip sits exactly on the clicked coordinate. */
function drawPin(source: { x: number; y: number }, ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.translate(source.x, source.y);

  ctx.beginPath(); // teardrop outline
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-14, -14, -10, -31, 0, -31);
  ctx.bezierCurveTo(10, -31, 14, -14, 0, 0);
  ctx.fillStyle = '#34d399'; // emerald-400
  ctx.strokeStyle = '#022c22'; // emerald-950
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();

  ctx.beginPath(); // dot in the middle
  ctx.arc(0, -20, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = '#022c22';
  ctx.fill();

  ctx.restore();
}

const formatCoordinate = (degrees: number) => degrees.toFixed(5);

export function initSkyMap(): void {
  // These ids are the DOM contract with index.html; byId() throws if one is renamed.
  const mapElement = byId('sky-map');
  const statusText = byId('status-text');
  const openPinLink = byId<HTMLAnchorElement>('open-pin-btn');

  const showMapUnavailable = () => {
    mapElement.innerHTML = `
      <div class="flex h-full flex-col items-center justify-center p-6 text-center">
        <p class="font-display text-base font-semibold text-white">Interactive sky map unavailable</p>
        <p class="mt-1 max-w-md text-sm text-slate-400">Your browser or network blocked the sky survey tiles. You can still jump directly into the explorer.</p>
        <a href="${EXPLORER_PATH}" class="btn mt-4 border-emerald-400 text-emerald-400">Open Explorer →</a>
      </div>`;
  };

  import('aladin-lite')
    .then(async ({ default: A }) => {
      await A.init;
      if (!(await surveyReachable())) return showMapUnavailable();
      const aladin: any = A.aladin('#sky-map', {
        survey: SKY_SURVEY,
        fov: MAP_START.fov,
        target: MAP_START.target,
        showCooGrid: false,
        showReticle: true,
        showFullscreenControl: false,
        showSimbadPointerControl: false,
        showCooGridControl: true,
      });

      const pinLayer: any = A.catalog({ name: 'picked-pin', shape: drawPin });
      aladin.addCatalog(pinLayer);

      // Where the pin currently is, so clicking it can open that coordinate.
      let pinnedCoords: { ra: number; dec: number } | null = null;
      // A pin click also fires a map click; this flag stops us re-dropping the pin.
      let justClickedPin = false;

      // 1. Clicking the dropped pin itself navigates straight to the Explorer page
      aladin.on('objectClicked', (object: any) => {
        if (!object || !pinnedCoords) return;
        justClickedPin = true;
        window.location.assign(
          buildExplorerUrl({ ra: pinnedCoords.ra, dec: pinnedCoords.dec, fov: EXPLORER_DEFAULT_FOV }),
        );
      });

      // Show a pointer cursor when hovering over the dropped pin
      aladin.on('objectHovered', (object: any) => {
        mapElement.style.cursor = object ? 'pointer' : '';
      });

      // Aladin's click event also fires after a drag-to-pan, so measure the movement ourselves.
      // Capture phase runs before Aladin's own handlers, so `wasDrag` is set in time.
      let pressX = 0;
      let pressY = 0;
      let wasDrag = false;
      mapElement.addEventListener(
        'pointerdown',
        (event) => {
          pressX = event.clientX;
          pressY = event.clientY;
          wasDrag = false;
        },
        { capture: true },
      );
      mapElement.addEventListener(
        'pointerup',
        (event) => {
          wasDrag = Math.hypot(event.clientX - pressX, event.clientY - pressY) > DRAG_THRESHOLD_PX;
        },
        { capture: true },
      );

      // 2. Clicking anywhere else on the sky drops/moves the pin
      aladin.on('click', (event: any) => {
        if (wasDrag) return;
        if (justClickedPin) {
          justClickedPin = false;
          return;
        }

        const position =
          event?.ra !== undefined && event?.dec !== undefined
            ? [event.ra, event.dec]
            : aladin.pix2world(event.x, event.y);

        if (!position || Number.isNaN(position[0]) || Number.isNaN(position[1])) {
          statusText.textContent = 'That point is outside the sky. Click inside the map.';
          return;
        }

        const [ra, dec] = position as [number, number];
        pinnedCoords = { ra, dec };
        void showSpherexImages(ra, dec);

        pinLayer.removeAll();
        pinLayer.addSources([A.source(ra, dec, { name: 'Pinned Target' })]);

        const explorerUrl = buildExplorerUrl({ ra, dec, fov: EXPLORER_DEFAULT_FOV });
        statusText.textContent = `Pinned RA ${formatCoordinate(ra)}°, Dec ${formatCoordinate(dec)}° — click the pin or button to inspect.`;
        openPinLink.href = explorerUrl;
        openPinLink.hidden = false;
      });
    })
    // Tiles or the script were blocked: still give visitors a way forward.
    .catch(showMapUnavailable);
}
