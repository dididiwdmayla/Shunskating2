/**
 * app.js
 * Bootstrap do SHUNSKATING v2.
 */

import { registerScreen, navigate, start } from './navigation.js';
import { el } from './utils.js';
import { getSettings, isSwipeHintShown, markSwipeHintShown } from './storage.js';

import home from './screens/home.js';
import tricks from './screens/tricks.js';
import trickDetail from './screens/trick-detail.js';
import metas from './screens/metas.js';
import dicas from './screens/dicas.js';
import game from './screens/game.js';
import skatistas from './screens/skatistas.js';

/* --- registra telas --- */
registerScreen('home', home);
registerScreen('tricks', tricks);
registerScreen('trickDetail', trickDetail);
registerScreen('metas', metas);
registerScreen('dicas', dicas);
registerScreen('game', game);
registerScreen('skatistas', skatistas);

/* --- monta bottom nav --- */
function buildBottomNav() {
    const nav = document.getElementById('bottom-nav');
    if (!nav) return;

    const items = [
        { id: 'home',   label: 'Capa',    icon: iconHome },
        { id: 'tricks', label: 'Catálogo', icon: iconBook },
        { id: 'game',   label: 'Game',    icon: iconGame },
        { id: 'metas',  label: 'Metas',   icon: iconTarget },
        { id: 'dicas',  label: 'Dicas',   icon: iconLamp }
    ];

    items.forEach((it) => {
        const btn = el('button', {
            className: 'nav-item',
            dataset: { screen: it.id },
            'aria-label': it.label,
            onClick: () => {
                if (it.disabled) {
                    showToast(`${it.label.toUpperCase()} · EM BREVE`);
                    return;
                }
                navigate(it.id);
            }
        });
        btn.innerHTML = `
            ${it.icon()}
            <span class="nav-item-label">${it.label}</span>
        `;
        nav.appendChild(btn);
    });
}

/* --- ícones SVG inline, estilo marcador ---
   Traços grossos (stroke-width 2.5), cantos redondos, silhueta simples.
*/

function iconHome() {
    return `<svg class="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 12l8-8 8 8"/>
        <path d="M6 10v9h12v-9"/>
        <path d="M10 19v-5h4v5"/>
    </svg>`;
}

function iconBook() {
    return `<svg class="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 4h7a3 3 0 0 1 3 3v13"/>
        <path d="M20 4h-7a3 3 0 0 0-3 3v13"/>
        <path d="M4 4v15h16V4"/>
    </svg>`;
}

function iconGame() {
    return `<svg class="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <path d="M7 8h10a4 4 0 0 1 4 4v0a4 4 0 0 1-4 4h-1l-2-2h-4l-2 2H7a4 4 0 0 1-4-4v0a4 4 0 0 1 4-4z"/>
        <circle cx="8" cy="12" r="0.5" fill="currentColor"/>
        <circle cx="16" cy="12" r="0.5" fill="currentColor"/>
    </svg>`;
}

function iconTarget() {
    return `<svg class="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9"/>
        <circle cx="12" cy="12" r="5"/>
        <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
    </svg>`;
}

function iconLamp() {
    return `<svg class="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 18h6"/>
        <path d="M10 21h4"/>
        <path d="M12 3a6 6 0 0 1 6 6c0 3-2 4.5-3 6v3H9v-3c-1-1.5-3-3-3-6a6 6 0 0 1 6-6z"/>
    </svg>`;
}

function showToast(text) {
    const t = el('div', { className: 'toast' }, text);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
}

/* --- aplica settings globais --- */
function applySettings() {
    const s = getSettings();
    if (s.reducedMotion) {
        document.body.classList.add('reduced-motion');
    }
}

/* --- inicia --- */
buildBottomNav();
applySettings();
start();

/* =========================================================
   GESTO: SWIPE DA DIREITA PRA ESQUERDA = abrir Skatistas
   Precisa começar nos últimos 25px da direita pra não
   conflitar com scroll vertical e outros gestos.
   ========================================================= */

(function installSwipeGesture() {
    const EDGE_ZONE = 25;       // px da direita pra começar
    const MIN_DX = 80;          // px de movimento horizontal mínimo
    const MAX_DY = 60;          // vertical tolerado
    let tStart = null;

    document.addEventListener('touchstart', (e) => {
        if (!e.touches || e.touches.length !== 1) return;
        const t = e.touches[0];
        const vw = window.innerWidth;
        if (t.clientX < vw - EDGE_ZONE) return;
        tStart = { x: t.clientX, y: t.clientY, time: Date.now() };
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (!tStart) return;
        const end = (e.changedTouches && e.changedTouches[0]);
        if (!end) { tStart = null; return; }
        const dx = end.clientX - tStart.x;
        const dy = Math.abs(end.clientY - tStart.y);
        const elapsed = Date.now() - tStart.time;
        tStart = null;
        if (dx < -MIN_DX && dy < MAX_DY && elapsed < 800) {
            navigate('skatistas');
        }
    }, { passive: true });
})();

/* =========================================================
   TUTORIAL DO GESTO (primeira vez)
   ========================================================= */

(function showSwipeHintOnce() {
    if (isSwipeHintShown()) return;
    // aguarda carregar tela pra não sobrepor splash
    setTimeout(() => {
        const overlay = el('div', { className: 'swipe-hint-overlay' });
        overlay.appendChild(el('div', { className: 'swipe-hint-arrow' }, '←'));
        overlay.appendChild(el('h2', { className: 'swipe-hint-title' }, 'ARRASTA DA DIREITA'));
        overlay.appendChild(el('p', { className: 'swipe-hint-text' },
            'pra abrir a galeria de skatistas que você conheceu. carimba gente, monta crews.'
        ));
        overlay.appendChild(el('button', {
            className: 'swipe-hint-btn',
            type: 'button',
            onClick: () => {
                markSwipeHintShown();
                overlay.classList.add('is-closing');
                setTimeout(() => overlay.remove(), 250);
            }
        }, 'ENTENDI'));
        // tap fora também fecha
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                markSwipeHintShown();
                overlay.classList.add('is-closing');
                setTimeout(() => overlay.remove(), 250);
            }
        });
        document.body.appendChild(overlay);
    }, 800);
})();
