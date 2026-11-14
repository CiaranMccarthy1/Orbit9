/**
 * Page entry point, loaded by index.html:
 *   <script type="module" src="/src/main.ts"></script>
 *
 * Styles load first so Tailwind is available before any component code runs.
 * Then each feature sets itself up:
 *   - initSkyMap() builds the Aladin sky map and pins clicks on #sky-map
 *   - initGuide()  wires the intro dialog and immediately opens it
 *
 * There is no router: this frontend is the homepage only. Other pages
 * (/explorer, /catalog) are linked to but served elsewhere.
 */
import './styles.css';
import { initGuide } from './guide/guide';
import { initSkyMap } from './sky-map';

initSkyMap();
initGuide();
