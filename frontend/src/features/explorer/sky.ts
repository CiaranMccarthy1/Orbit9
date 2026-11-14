// path: src/features/explorer/sky.ts
import A from 'aladin-lite';

export interface Sky {
  el: HTMLElement;
  aladin: any;
  flyTo(ra: number, dec: number, fov: number): void;
}

export async function createSky(el: HTMLElement, ra: number, dec: number, fov: number): Promise<Sky> {
  await A.init;
  // path: src/features/explorer/sky.ts  (inside A.aladin options)
  const aladin = A.aladin('#' + el.id, {
    survey: 'P/allWISE/color',
    target: `${ra} ${dec}`,
    fov,
    projection: 'AIT',
    showCooGrid: true,
    showReticle: true,
    showZoomControl: false,
    showFullscreenControl: false,
  });

  return {
    el,
    aladin,
    flyTo(ra, dec, fov) {
      aladin.animateToRaDec(ra, dec, 2);
      aladin.zoomToFoV(fov, 2);
    },
  };
}