/**
 * Shared URL state contract between the Homepage pin-drop and the Explorer/Spectra page.
 * Keeps query parameter names and formatting in one place so both pages stay in sync.
 */
import { EXPLORER_PATH, MAP_START } from './config';

export interface ExplorerUrlState {
  ra: number;
  dec: number;
  fov: number;
  mode: 'blink' | 'diff' | 'coadd' | 'rgb';
  epoch: number;
  mask: boolean;
}

export function buildExplorerUrl(state: Partial<ExplorerUrlState>): string {
  const params = new URLSearchParams();
  if (state.ra !== undefined) params.set('ra', state.ra.toFixed(5));
  if (state.dec !== undefined) params.set('dec', state.dec.toFixed(5));
  if (state.fov !== undefined) params.set('fov', String(state.fov));
  if (state.mode && state.mode !== 'blink') params.set('mode', state.mode);
  if (state.epoch) params.set('epoch', String(state.epoch));
  if (state.mask) params.set('mask', '1');

  const query = params.toString();
  return query ? `${EXPLORER_PATH}?${query}` : EXPLORER_PATH;
}

export function readExplorerUrlState(): ExplorerUrlState {
  const params = new URLSearchParams(window.location.search);
  const [defaultRa, defaultDec] = MAP_START.target.split(' ').map(Number);

  const ra = params.has('ra') ? Number(params.get('ra')) : defaultRa;
  const dec = params.has('dec') ? Number(params.get('dec')) : defaultDec;
  const fov = Number(params.get('fov'));
  const mode = params.get('mode');
  const epoch = Number(params.get('epoch'));

  return {
    ra: Number.isFinite(ra) ? ra : defaultRa,
    dec: Number.isFinite(dec) ? dec : defaultDec,
    fov: Number.isFinite(fov) && fov > 0 ? fov : 0.5,
    mode: mode === 'diff' || mode === 'coadd' || mode === 'rgb' ? mode : 'blink',
    epoch: Number.isFinite(epoch) ? epoch : 0,
    mask: params.get('mask') === '1',
  };
}
