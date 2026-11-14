import { initGuide } from './guide/guide';
import { initSkyMap } from './sky-map';
import { initTargetBar } from './targetBar';
import { initSessionUI } from './auth';

initSkyMap();
initGuide();
void initTargetBar();
void initSessionUI();
