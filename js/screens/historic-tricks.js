/**
 * screens/historic-tricks.js — manobras históricas (imutáveis)
 *
 * Mostra 2 visões:
 *  - Por manobra: lista de manobras do catálogo com skatistas associados
 *  - Por skatista: perfil curto + manobras associadas + bio
 */

import { el, fetchJson } from '../utils.js';
import { navigate } from '../navigation.js';

let historicData = null;
let tricksData = null;

async function load() {
    if (!historicData) historicData = await fetchJson('data/historic-tricks.json');
    if (!tricksData) tricksData = await fetchJson('data/tricks.json');
    return { historic: historicData, tricks: tricksData };
}

async function render(container) {
    container.innerHTML = '';
    const { historic, tricks } = await load();
    const screen = el('div', { className: 'screen historic-screen' });

    /* header */
    const header = el('div', { className: 'historic-header' });
    header.appendChild(el('button', {
        className: 'btn-back', type: 'button',
        onClick: () => navigate('metas')
    }, '← VOLTAR'));
    header.appendChild(el('h1', { className: 'historic-title xerox-tremor' }, 'MANOBRAS HISTÓRICAS'));
    screen.appendChild(header);

    screen.appendChild(el('p', { className: 'historic-intro' },
        'quem moldou cada manobra. registros imutáveis — atribuições conservadoras pra evitar lendas inventadas.'));

    /* tabs */
    const tabs = el('div', { className: 'historic-tabs' });
    const byTrickBtn = el('button', { className: 'historic-tab is-active', type: 'button' }, 'POR MANOBRA');
    const byProBtn = el('button', { className: 'historic-tab', type: 'button' }, 'POR SKATISTA');
    tabs.appendChild(byTrickBtn);
    tabs.appendChild(byProBtn);
    screen.appendChild(tabs);

    const content = el('div', { className: 'historic-content' });
    screen.appendChild(content);

    function showByTrick() {
        byTrickBtn.classList.add('is-active');
        byProBtn.classList.remove('is-active');
        renderByTrick(content, historic, tricks);
    }
    function showByPro() {
        byProBtn.classList.add('is-active');
        byTrickBtn.classList.remove('is-active');
        renderByPro(content, historic, tricks);
    }
    byTrickBtn.addEventListener('click', showByTrick);
    byProBtn.addEventListener('click', showByPro);

    container.appendChild(screen);
    showByTrick();
}

function renderByTrick(content, historic, tricks) {
    content.innerHTML = '';
    const byTrick = historic.byTrick || {};

    // Itera só nas manobras do catálogo que têm entrada histórica
    tricks.tricks.forEach(t => {
        const entries = byTrick[t.id];
        if (!entries || entries.length === 0) return;

        const card = el('article', { className: 'historic-trick-card' });
        const head = el('div', { className: 'historic-trick-head' });
        head.appendChild(el('h2', { className: 'historic-trick-name' }, t.name));
        head.appendChild(el('button', {
            className: 'historic-trick-open', type: 'button',
            onClick: () => navigate('trickDetail', { id: t.id })
        }, 'abrir →'));
        card.appendChild(head);

        entries.forEach(entry => {
            const block = el('div', { className: 'historic-entry' });
            const headRow = el('div', { className: 'historic-entry-head' });
            headRow.appendChild(el('strong', { className: 'historic-entry-skater' }, entry.skater));
            if (entry.year) {
                headRow.appendChild(el('span', { className: 'historic-entry-year' }, ' · ' + entry.year));
            }
            if (entry.role) {
                headRow.appendChild(el('span', { className: 'historic-entry-role' }, ' · ' + entry.role));
            }
            block.appendChild(headRow);
            if (entry.note) {
                block.appendChild(el('p', { className: 'historic-entry-note' }, entry.note));
            }
            card.appendChild(block);
        });

        content.appendChild(card);
    });

    // Manobras sem entrada histórica
    const missing = tricks.tricks.filter(t => !byTrick[t.id] || byTrick[t.id].length === 0);
    if (missing.length > 0) {
        const note = el('p', { className: 'historic-missing' },
            'sem registros históricos ainda: ' + missing.map(t => t.name).join(', '));
        content.appendChild(note);
    }
}

function renderByPro(content, historic, tricks) {
    content.innerHTML = '';
    const byPro = historic.byPro || {};

    Object.values(byPro).forEach(pro => {
        const card = el('article', { className: 'historic-pro-card' });

        const head = el('div', { className: 'historic-pro-head' });
        head.appendChild(el('h2', { className: 'historic-pro-name' }, pro.name));
        if (pro.subtitle) {
            head.appendChild(el('p', { className: 'historic-pro-subtitle' }, '"' + pro.subtitle + '"'));
        }
        const meta = el('p', { className: 'historic-pro-meta' });
        if (pro.from) meta.appendChild(document.createTextNode(pro.from));
        if (pro.born && pro.died) {
            meta.appendChild(document.createTextNode(` · ${pro.born}-${pro.died}`));
        } else if (pro.born) {
            meta.appendChild(document.createTextNode(` · nascido em ${pro.born}`));
        }
        head.appendChild(meta);
        card.appendChild(head);

        if (pro.bio) {
            card.appendChild(el('p', { className: 'historic-pro-bio' }, pro.bio));
        }

        if (pro.tricks && pro.tricks.length > 0) {
            card.appendChild(el('h3', { className: 'historic-pro-tricks-header' }, 'MANOBRAS ASSOCIADAS'));
            const trickRow = el('div', { className: 'historic-pro-tricks' });
            pro.tricks.forEach(tid => {
                const t = tricks.tricks.find(x => x.id === tid);
                if (!t) return;
                trickRow.appendChild(el('button', {
                    className: 'historic-pro-trick', type: 'button',
                    onClick: () => navigate('trickDetail', { id: t.id })
                }, t.name));
            });
            card.appendChild(trickRow);
        }

        content.appendChild(card);
    });
}

export default { render };
