import { initGuide } from './guide/guide';
import { initSkyMap } from './sky-map';
import { initSessionUI } from './auth';

initSkyMap();
initGuide();
void initSessionUI();
