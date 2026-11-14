// path: src/features/explorer/store.ts
export type Mode = 'single' | 'diff' | 'coadd' | 'rgb';
export interface Epoch { id: string; date: string }
export interface State {
  ra: number; dec: number; fov: number;
  epochs: Epoch[]; idx: number;
  mode: Mode; split: boolean; mask: boolean;
  rgb: { r: number; g: number; b: number };
}

const state: State = {
  ra: 0, dec: 0, fov: 0.5, epochs: [], idx: 0,
  mode: 'single', split: false, mask: false,
  rgb: { r: 3.0, g: 4.26, b: 4.67 },
};
const bus = new EventTarget();

export const get = () => state;
export function set(patch: Partial<State>) {
  Object.assign(state, patch);
  bus.dispatchEvent(new CustomEvent('change', { detail: patch }));
}
export const onChange = (cb: (p: Partial<State>) => void) =>
  bus.addEventListener('change', (e) => cb((e as CustomEvent).detail));