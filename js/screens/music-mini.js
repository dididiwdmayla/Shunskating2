/**
 * music-mini.js — mini-player persistente.
 *
 * Inserido no body uma vez (em app.js) e atualiza via subscribe().
 * Aparece quando há track ativa e !miniHidden.
 * Tap em outro lugar (não nos botões): abre tela cheia de música.
 */

import { el } from '../utils.js';
import * as player from '../music-player.js';
import { navigate } from '../navigation.js';

let _miniEl = null;
let _hiddenIndicatorEl = null;

export function init() {
    if (_miniEl) return;
    _miniEl = el('div', { className: 'music-mini', id: 'music-mini', hidden: '' });
    document.body.appendChild(_miniEl);

    _hiddenIndicatorEl = el('button', {
        className: 'music-mini-hidden-indicator',
        id: 'music-mini-hidden-indicator',
        type: 'button',
        'aria-label': 'mostrar mini-player',
        hidden: '',
        onClick: (e) => {
            e.stopPropagation();
            player.showMini();
        }
    }, '♪');
    document.body.appendChild(_hiddenIndicatorEl);

    player.subscribe(render);
}

function render(state) {
    if (!_miniEl) return;
    const active = !!state.currentTrack;

    if (!active) {
        _miniEl.setAttribute('hidden', '');
        _hiddenIndicatorEl.setAttribute('hidden', '');
        document.body.classList.remove('has-mini-player');
        return;
    }

    if (state.miniHidden) {
        _miniEl.setAttribute('hidden', '');
        _hiddenIndicatorEl.removeAttribute('hidden');
        document.body.classList.remove('has-mini-player');
        return;
    }

    _hiddenIndicatorEl.setAttribute('hidden', '');
    _miniEl.removeAttribute('hidden');
    document.body.classList.add('has-mini-player');

    _miniEl.innerHTML = '';

    /* área tocável (capa + título) — abre tela cheia */
    const tap = el('div', {
        className: 'music-mini-tap',
        onClick: () => navigate('music')
    });

    /* capa */
    const cover = el('div', { className: 'music-mini-cover' });
    let h = 0;
    const s = state.currentTrack.title || '';
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const palette = ['#c8201f', '#e84118', '#1ea84a', '#7a2a4a', '#e91e63', '#b85c1f', '#ff8c1a', '#1f3a6e', '#0d9ee5', '#9c27b0', '#d4a017'];
    const color = palette[h % palette.length];
    cover.style.background = color;
    cover.textContent = (state.currentTrack.title || '?').charAt(0).toUpperCase();
    tap.appendChild(cover);

    const info = el('div', { className: 'music-mini-info' });
    info.appendChild(el('div', { className: 'music-mini-title' }, state.currentTrack.title));
    if (state.currentTrack.artist) {
        info.appendChild(el('div', { className: 'music-mini-artist' }, state.currentTrack.artist));
    }
    tap.appendChild(info);

    _miniEl.appendChild(tap);

    /* controles */
    const ctrls = el('div', { className: 'music-mini-ctrls' });

    ctrls.appendChild(el('button', {
        className: 'music-mini-btn', type: 'button',
        'aria-label': 'anterior',
        onClick: (e) => { e.stopPropagation(); player.playPrev(); }
    }, '⏮'));

    ctrls.appendChild(el('button', {
        className: 'music-mini-btn', type: 'button',
        'aria-label': state.isPlaying ? 'pausar' : 'tocar',
        onClick: (e) => { e.stopPropagation(); player.togglePlay(); }
    }, state.isPlaying ? '⏸' : '▶'));

    ctrls.appendChild(el('button', {
        className: 'music-mini-btn', type: 'button',
        'aria-label': 'próxima',
        onClick: (e) => { e.stopPropagation(); player.playNext(); }
    }, '⏭'));

    ctrls.appendChild(el('button', {
        className: 'music-mini-btn music-mini-hide', type: 'button',
        'aria-label': 'esconder mini-player',
        onClick: (e) => { e.stopPropagation(); player.hideMini(); }
    }, '🎧'));

    _miniEl.appendChild(ctrls);

    /* barra de progresso fina */
    const prog = el('div', { className: 'music-mini-prog' });
    const pct = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;
    prog.appendChild(el('div', { className: 'music-mini-prog-fill', style: { width: pct + '%' } }));
    _miniEl.appendChild(prog);
}
