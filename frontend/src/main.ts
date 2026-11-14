import { initGuide } from './guide/guide';
import { initSkyMap } from './sky-map';
import { initSessionUI } from './auth';
import { MAP_START } from './config';
import { showSpherexImages } from './spherex';

initSkyMap();
initGuide();
void initSessionUI();

const [ra, dec] = MAP_START.target.split(' ').map(Number);
void showSpherexImages(ra, dec, false);
