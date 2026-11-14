// path: src/main.ts
import './style.css';
import { mountExplorer } from './features/explorer/explorer.ts';

mountExplorer(document.getElementById('app')!);