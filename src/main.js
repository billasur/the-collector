import { MARKUP } from './markup.js';
import { initRig } from './rig.js';
import renderUrl from './img/render.jpg';
import './style.css';

const root = document.getElementById('root');
const el = document.createElement('div');
el.className = 'collector';
el.innerHTML = MARKUP.replace('__RENDER__', renderUrl);
root.appendChild(el);
initRig(el);
