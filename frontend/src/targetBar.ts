import { byId } from './dom';
import { getTargets } from './api';
import { buildExplorerUrl } from './urlState';

export async function initTargetBar(): Promise<void> {
  const container = byId('target-bar');
  try {
    const targets = await getTargets();
    const buttons = targets.map((target) => {
      const link = document.createElement('a');
      link.className = 'btn border-emerald-400/60 text-emerald-400';
      link.href = buildExplorerUrl({ ra: target.ra, dec: target.dec, fov: 0.5 });
      link.textContent = target.name;
      return link;
    });
    container.replaceChildren(...buttons);
  } catch {
    container.textContent = 'Preset targets unavailable.';
  }
}
