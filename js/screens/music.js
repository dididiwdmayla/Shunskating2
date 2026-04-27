/**
 * music.js — tela de música.
 *
 * Funcionalidades:
 *  - Importar arquivos do dispositivo (input file)
 *  - Listar tracks com capa procedural
 *  - Tap em track: toca imediatamente, demais viram fila
 *  - Player full-screen com controles
 *  - Editar metadata (título/artista/álbum)
 *  - Deletar track
 */

import { el } from '../utils.js';
import * as db from '../music-db.js';
import * as player from '../music-player.js';
import * as fx from '../audio-fx.js';
import * as sfx from '../sfx.js';

let _screen = null;
let _unsubPlayer = null;

export async function render(container) {
    container.innerHTML = '';
    const screen = el('div', { className: 'screen music-screen' });
    _screen = screen;

    /* cabeçalho */
    screen.appendChild(el('div', { className: 'music-bg-overlay' }));
    const header = el('header', { className: 'music-header' });
    header.appendChild(el('h1', { className: 'music-title' }, 'SOM'));
    header.appendChild(el('p', { className: 'music-sub' }, 'sua trilha pra mandar'));
    screen.appendChild(header);

    /* área importar */
    const importRow = el('div', { className: 'music-import-row' });

    const importBtn = el('button', { className: 'music-import-btn', type: 'button' }, '+ IMPORTAR ARQUIVOS');
    const fileInput = el('input', {
        type: 'file',
        accept: 'audio/*',
        multiple: '',
        style: { display: 'none' },
        onChange: (e) => handleImport(e.target.files)
    });
    importBtn.addEventListener('click', () => fileInput.click());
    importRow.appendChild(importBtn);
    importRow.appendChild(fileInput);

    const usageInfo = el('p', { className: 'music-usage', id: 'music-usage' }, '');
    importRow.appendChild(usageInfo);

    const warn = el('p', { className: 'music-warn' },
        'atenção: o sistema pode apagar arquivos se faltar espaço. mantém backup do original.');
    importRow.appendChild(warn);

    /* toggle de sons da interface */
    const sfxRow = el('div', { className: 'music-sfx-row' });
    const sfxLabel = el('span', { className: 'music-sfx-label' }, 'sons da interface');
    const sfxToggle = el('button', {
        className: `music-sfx-toggle${sfx.isEnabled() ? ' is-on' : ''}`,
        type: 'button',
        'data-no-click-sound': '',
        onClick: (e) => {
            const newVal = !sfx.isEnabled();
            sfx.setEnabled(newVal);
            sfxToggle.classList.toggle('is-on', newVal);
            sfxToggle.textContent = newVal ? 'ON' : 'OFF';
            // se ligou, faz um click pra confirmar
            if (newVal) sfx.click();
        }
    }, sfx.isEnabled() ? 'ON' : 'OFF');
    sfxRow.appendChild(sfxLabel);
    sfxRow.appendChild(sfxToggle);
    importRow.appendChild(sfxRow);

    screen.appendChild(importRow);

    /* player atual (cards quando algo tocando) */
    const playerHost = el('div', { className: 'music-player-host', id: 'music-player-host' });
    screen.appendChild(playerHost);

    /* lista */
    const listHeader = el('h2', { className: 'music-list-header' }, 'TRACKS');
    screen.appendChild(listHeader);

    const list = el('div', { className: 'music-list', id: 'music-list' });
    screen.appendChild(list);

    container.appendChild(screen);

    await refresh();

    // re-renderiza player + lista (pra badge "tocando" mover) quando estado muda
    let lastPlayingId = null;
    _unsubPlayer = player.subscribe((s) => {
        renderPlayerHost();
        if (s.currentId !== lastPlayingId) {
            lastPlayingId = s.currentId;
            refreshListOnly();
        }
    });
}

/** Re-renderiza só a lista (sem refazer fetch do DB se não precisar). */
async function refreshListOnly() {
    const list = document.getElementById('music-list');
    if (!list) return;
    await refresh();
}

export function destroy() {
    if (_unsubPlayer) { _unsubPlayer(); _unsubPlayer = null; }
    _screen = null;
}

/** Lê um arquivo, extrai metadados básicos, salva no DB. */
async function handleImport(files) {
    if (!files || files.length === 0) return;
    const list = document.getElementById('music-list');

    let added = 0;
    for (const file of files) {
        try {
            const duration = await getAudioDuration(file);
            // título inferido do nome do arquivo (sem extensão)
            const title = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
            await db.addTrack({
                title,
                artist: '',
                album: '',
                duration,
                type: file.type || 'audio/mpeg',
                blob: file
            });
            added++;
        } catch (e) {
            console.warn('[music] erro importando', file.name, e);
        }
    }
    if (added > 0) {
        flashToast(`${added} track${added > 1 ? 's' : ''} adicionada${added > 1 ? 's' : ''}`);
        await refresh();
    }
}

/** Lê duração em segundos via elemento Audio temporário. */
function getAudioDuration(file) {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const a = new Audio();
        a.preload = 'metadata';
        a.onloadedmetadata = () => {
            const d = a.duration || 0;
            URL.revokeObjectURL(url);
            resolve(d);
        };
        a.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(0);
        };
        a.src = url;
    });
}

/** Re-renderiza a lista e a info de uso. */
async function refresh() {
    const list = document.getElementById('music-list');
    if (!list) return;

    const tracks = await db.listTracks();
    const total = await db.totalSize();

    const usage = document.getElementById('music-usage');
    if (usage) {
        const mb = (total / 1024 / 1024).toFixed(1);
        usage.textContent = `${tracks.length} track${tracks.length !== 1 ? 's' : ''} · ${mb} MB`;
    }

    list.innerHTML = '';
    if (tracks.length === 0) {
        list.appendChild(el('p', { className: 'music-empty' },
            'nenhuma música ainda. importa arquivos pra começar.'));
        return;
    }

    const playerState = player.getState();
    const playingId = playerState.currentId;

    tracks.forEach((t, i) => {
        const isPlaying = playingId === t.id;
        const card = el('div', {
            className: `music-card${isPlaying ? ' is-now-playing' : ''}`,
            dataset: { id: t.id }
        });
        card.appendChild(renderCover(t));
        const info = el('div', { className: 'music-card-info' });
        const titleRow = el('div', { className: 'music-card-title-row' });
        if (isPlaying) {
            titleRow.appendChild(el('span', { className: 'music-card-now', 'aria-label': 'tocando' }, '♪'));
        }
        titleRow.appendChild(el('span', { className: 'music-card-title' }, displayTitle(t)));
        if (t.isUrl) {
            titleRow.appendChild(el('span', { className: 'music-card-url-tag' }, 'URL'));
        }
        info.appendChild(titleRow);
        info.appendChild(el('div', { className: 'music-card-meta' },
            `${t.artist || (t.isUrl ? 'externa' : 'desconhecido')} · ${formatTime(t.duration)}`));
        card.appendChild(info);

        const actions = el('div', { className: 'music-card-actions' });
        actions.appendChild(el('button', {
            className: 'music-card-btn music-card-play', type: 'button',
            'aria-label': 'tocar',
            onClick: () => {
                const rest = tracks.slice(i + 1).concat(tracks.slice(0, i));
                player.playTrackNow(t, rest);
            }
        }, '▶'));

        actions.appendChild(el('button', {
            className: 'music-card-btn music-card-edit', type: 'button',
            'aria-label': 'editar',
            onClick: () => openEditDialog(t)
        }, '✎'));

        actions.appendChild(el('button', {
            className: 'music-card-btn music-card-delete', type: 'button',
            'aria-label': 'deletar',
            onClick: async () => {
                if (!confirm(`deletar "${displayTitle(t)}"?`)) return;
                await db.deleteTrack(t.id);
                await refresh();
            }
        }, '×'));

        card.appendChild(actions);
        list.appendChild(card);
    });
}

/** Trata título vazio com fallback. */
function displayTitle(t) {
    const raw = (t.title || '').trim();
    if (!raw || raw === 'Sem título') return t.isUrl ? 'URL externa' : 'Sem título';
    return raw;
}

/** Render do player full quando tem track tocando. */
function renderPlayerHost() {
    const host = document.getElementById('music-player-host');
    if (!host) return;
    const s = player.getState();
    if (!s.currentTrack) {
        host.innerHTML = '';
        return;
    }
    host.innerHTML = '';
    const card = el('div', { className: 'music-fullplayer' });
    card.appendChild(renderCover(s.currentTrack, 120));
    card.appendChild(el('div', { className: 'music-fullplayer-title' }, displayTitle(s.currentTrack)));
    card.appendChild(el('div', { className: 'music-fullplayer-meta' },
        s.currentTrack.artist || (s.currentTrack.isUrl ? 'URL externa' : 'desconhecido')));

    /* progresso */
    const progRow = el('div', { className: 'music-prog-row' });
    progRow.appendChild(el('span', { className: 'music-prog-time' }, formatTime(s.currentTime)));
    const slider = el('input', {
        type: 'range', min: 0, max: s.duration || 0, step: 0.5,
        value: s.currentTime,
        className: 'music-prog-slider',
        onInput: (e) => player.seek(parseFloat(e.target.value))
    });
    progRow.appendChild(slider);
    progRow.appendChild(el('span', { className: 'music-prog-time' }, formatTime(s.duration)));
    card.appendChild(progRow);

    /* controles */
    const ctrl = el('div', { className: 'music-controls' });
    ctrl.appendChild(el('button', {
        className: `music-ctrl-btn music-ctrl-shuffle${s.shuffle ? ' is-active' : ''}`,
        type: 'button',
        'aria-label': 'shuffle',
        'aria-pressed': s.shuffle ? 'true' : 'false',
        onClick: () => player.toggleShuffle()
    }, '⇄'));
    ctrl.appendChild(el('button', {
        className: 'music-ctrl-btn', type: 'button',
        'aria-label': 'anterior', onClick: () => player.playPrev()
    }, '⏮'));
    ctrl.appendChild(el('button', {
        className: 'music-ctrl-btn music-ctrl-play', type: 'button',
        'aria-label': s.isPlaying ? 'pausar' : 'tocar',
        onClick: () => player.togglePlay()
    }, s.isPlaying ? '⏸' : '▶'));
    ctrl.appendChild(el('button', {
        className: 'music-ctrl-btn', type: 'button',
        'aria-label': 'próxima', onClick: () => player.playNext()
    }, '⏭'));
    ctrl.appendChild(el('button', {
        className: 'music-ctrl-btn music-ctrl-eq', type: 'button',
        'aria-label': 'equalizador',
        onClick: () => openEqDialog()
    }, '≡'));
    card.appendChild(ctrl);

    /* fila */
    if (s.queue.length > 0) {
        card.appendChild(el('h3', { className: 'music-queue-header' }, 'PRÓXIMAS'));
        const qList = el('div', { className: 'music-queue' });
        s.queue.forEach((t, i) => {
            const item = el('div', {
                className: 'music-queue-item',
                draggable: 'true',
                dataset: { idx: i },
                onDragstart: (e) => {
                    e.dataTransfer.setData('text/plain', String(i));
                    e.dataTransfer.effectAllowed = 'move';
                    item.classList.add('is-dragging');
                },
                onDragend: () => item.classList.remove('is-dragging'),
                onDragover: (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    item.classList.add('is-drag-over');
                },
                onDragleave: () => item.classList.remove('is-drag-over'),
                onDrop: (e) => {
                    e.preventDefault();
                    item.classList.remove('is-drag-over');
                    const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
                    const to = i;
                    if (!isNaN(from) && from !== to) player.moveInQueue(from, to);
                }
            });
            item.appendChild(el('span', { className: 'music-queue-handle', 'aria-hidden': 'true' }, '⋮⋮'));
            item.appendChild(el('span', { className: 'music-queue-title' }, displayTitle(t)));
            item.appendChild(el('button', {
                className: 'music-queue-remove', type: 'button',
                'aria-label': 'remover',
                onClick: () => player.removeFromQueue(i)
            }, '×'));
            qList.appendChild(item);
        });
        card.appendChild(qList);
    }

    host.appendChild(card);
}

/** Modal pra editar metadata. */
function openEditDialog(track) {
    const overlay = el('div', {
        className: 'music-edit-overlay',
        onClick: (e) => { if (e.target === overlay) overlay.remove(); }
    });
    const card = el('div', { className: 'music-edit-card' });
    card.appendChild(el('h3', {}, 'editar'));

    const titleInput = el('input', { type: 'text', value: track.title || '', placeholder: 'título', className: 'music-edit-input' });
    const artistInput = el('input', { type: 'text', value: track.artist || '', placeholder: 'artista', className: 'music-edit-input' });
    const albumInput = el('input', { type: 'text', value: track.album || '', placeholder: 'álbum', className: 'music-edit-input' });

    card.appendChild(titleInput);
    card.appendChild(artistInput);
    card.appendChild(albumInput);

    const btnRow = el('div', { className: 'music-edit-btnrow' });
    btnRow.appendChild(el('button', {
        className: 'music-edit-cancel', type: 'button',
        onClick: () => overlay.remove()
    }, 'CANCELAR'));
    btnRow.appendChild(el('button', {
        className: 'music-edit-save', type: 'button',
        onClick: async () => {
            await db.updateTrack(track.id, {
                title: titleInput.value.trim() || 'Sem título',
                artist: artistInput.value.trim(),
                album: albumInput.value.trim()
            });
            overlay.remove();
            await refresh();
        }
    }, 'SALVAR'));
    card.appendChild(btnRow);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
}

/** Capa procedural baseada no título. */
function renderCover(track, size = 56) {
    const wrapper = el('div', { className: 'music-cover', style: { width: size + 'px', height: size + 'px' } });
    // hash simples do título pra cor
    let h = 0;
    const s = (track.title || track.id || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const palette = [
        '#c8201f', '#e84118', '#1ea84a', '#7a2a4a', '#e91e63',
        '#b85c1f', '#ff8c1a', '#1f3a6e', '#0d9ee5', '#9c27b0', '#d4a017'
    ];
    const color = palette[h % palette.length];
    const initial = (track.title || '?').charAt(0).toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">
        <rect width="100" height="100" fill="${color}"/>
        <g opacity="0.2">${
            Array.from({ length: 8 }, (_, i) =>
                `<line x1="0" y1="${i * 14}" x2="100" y2="${i * 14}" stroke="#000" stroke-width="0.5"/>`
            ).join('')
        }</g>
        <text x="50" y="58" text-anchor="middle" font-family="Anton,Impact,sans-serif" font-size="48" fill="#fefefe">${escapeXml(initial)}</text>
    </svg>`;
    wrapper.innerHTML = svg;
    return wrapper;
}

function escapeXml(s) {
    return String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
}

function formatTime(s) {
    if (!s || isNaN(s)) return '0:00';
    s = Math.floor(s);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
}

function flashToast(text) {
    const t = el('div', { className: 'music-toast' }, text);
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('is-fade'), 1500);
    setTimeout(() => t.remove(), 2200);
}

function openEqDialog() {
    const overlay = el('div', {
        className: 'music-edit-overlay music-eq-overlay',
        onClick: (e) => { if (e.target === overlay) overlay.remove(); }
    });
    const card = el('div', { className: 'music-eq-card' });

    card.appendChild(el('h3', { className: 'music-eq-title' }, 'EQ'));

    const fxState = fx.getState();
    if (!fxState.initialized) {
        card.appendChild(el('p', { className: 'music-eq-warn' },
            'toca uma música primeiro pra ativar o equalizador.'));
        const closeBtn = el('button', {
            className: 'music-edit-cancel', type: 'button',
            onClick: () => overlay.remove()
        }, 'OK');
        card.appendChild(closeBtn);
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        return;
    }

    /* on/off toggle */
    const toggleRow = el('div', { className: 'music-eq-toggle-row' });
    const toggleBtn = el('button', {
        className: `music-eq-toggle${fxState.enabled ? ' is-on' : ''}`,
        type: 'button',
        onClick: () => {
            fx.setEnabled(!fx.getState().enabled);
            redraw();
        }
    }, fxState.enabled ? 'ATIVO' : 'DESLIGADO');
    toggleRow.appendChild(toggleBtn);
    card.appendChild(toggleRow);

    /* presets */
    const presetRow = el('div', { className: 'music-eq-presets' });
    const presetLabels = {
        flat: 'FLAT', bassBoost: 'GRAVES', vocal: 'VOCAL',
        lofi: 'LO-FI', bright: 'BRILHO', skate: 'SKATE'
    };
    fx.getPresets().forEach(p => {
        presetRow.appendChild(el('button', {
            className: 'music-eq-preset', type: 'button',
            onClick: () => {
                fx.applyPreset(p);
                redraw();
            }
        }, presetLabels[p] || p.toUpperCase()));
    });
    card.appendChild(presetRow);

    /* sliders */
    const sliders = el('div', { className: 'music-eq-sliders' });
    fx.EQ_BANDS.forEach((band, i) => {
        const col = el('div', { className: 'music-eq-col' });
        const valLabel = el('span', {
            className: 'music-eq-val',
            id: `music-eq-val-${i}`
        }, formatDb(fxState.gains[i]));
        col.appendChild(valLabel);

        const slider = el('input', {
            type: 'range',
            min: -12, max: 12, step: 0.5,
            value: fxState.gains[i],
            className: 'music-eq-slider',
            'aria-label': `${band.label} Hz`,
            onInput: (e) => {
                const v = parseFloat(e.target.value);
                fx.setBandGain(i, v);
                document.getElementById(`music-eq-val-${i}`).textContent = formatDb(v);
            }
        });
        slider.style.setProperty('writing-mode', 'bt-lr');
        col.appendChild(slider);
        col.appendChild(el('span', { className: 'music-eq-freq' }, band.label));
        sliders.appendChild(col);
    });
    card.appendChild(sliders);

    /* fechar */
    const btnRow = el('div', { className: 'music-edit-btnrow' });
    btnRow.appendChild(el('button', {
        className: 'music-edit-save', type: 'button',
        onClick: () => overlay.remove()
    }, 'FECHAR'));
    card.appendChild(btnRow);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    function redraw() {
        overlay.remove();
        openEqDialog();
    }
}

function formatDb(v) {
    const sign = v > 0 ? '+' : '';
    return `${sign}${v.toFixed(1)}`;
}

export default { render, destroy };
