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
import { initTargetBar } from './targetBar';
import { initExplorer } from './explorer';
import catalogHtml from './catalog.html?raw';

const path = window.location.pathname.replace(/\/$/, '');
if (path === '/catalog') {
  const page = new DOMParser().parseFromString(catalogHtml, 'text/html');
  document.title = page.title;
  page.head.querySelectorAll('style').forEach((style) => document.head.append(style));
  document.body.replaceWith(page.body);
  void import('./catalog');
} else if (path === '/explorer') {
  initExplorer();
} else {
  initSkyMap();
  initGuide();
  void initTargetBar();
}
