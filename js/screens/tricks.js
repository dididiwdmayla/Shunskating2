/**
 * screens/tricks.js
 * Catálogo de manobras.
 */

import { el, norm, debounce, fetchJson } from '../utils.js';
import { navigate } from '../navigation.js';
import { getFavorites, getProgressAverage } from '../storage.js';

let tricksData = null;
let currentFilter = 'all';
let currentSearch = '';

async function loadTricks() {
    if (tricksData) return tricksData;
    try {
        tricksData = await fetchJson('data/tricks.json');
        return tricksData;
    } catch (err) {
        console.error('[tricks] falha ao carregar tricks.json', err);
        tricksData = { categories: [], tricks: [] };
        return tricksData;
    }
}

async function render(container) {
    // skeleton enquanto carrega
    container.appendChild(el('div', { className: 'screen-tricks scan-loader' },
        el('h1', { className: 'tricks-title' }, 'CATÁLOGO')
    ));

    const data = await loadTricks();
    container.innerHTML = '';

    const screen = el('div', { className: 'screen-tricks' });

    /* --- HEADER --- */
    screen.appendChild(el('div', { className: 'tricks-header' },
        el('h1', { className: 'tricks-title' }, 'CATÁLOGO'),
        el('div', { className: 'tricks-count' },
            el('strong', {}, String(data.tricks.length)),
            ' MANOBRAS'
        )
    ));

    /* --- BUSCA --- */
    const searchWrap = el('div', { className: 'tricks-search input-search' },
        el('input', {
            type: 'search',
            className: 'input-base',
            placeholder: 'buscar manobra...',
            'aria-label': 'Buscar manobra',
            oninput: debounce((e) => {
                currentSearch = e.target.value;
                renderGrid(screen, data);
            }, 200)
        })
    );
    screen.appendChild(searchWrap);

    /* --- FILTROS DE CATEGORIA --- */
    const filters = el('div', { className: 'tricks-filters', role: 'tablist', 'aria-label': 'Filtro por categoria' });
    filters.appendChild(el('button', {
        className: 'chip is-active',
        dataset: { filter: 'all' },
        onClick: (e) => handleFilterClick(e, screen, data)
    }, 'TODAS'));

    data.categories.forEach((cat) => {
        filters.appendChild(el('button', {
            className: 'chip',
            dataset: { filter: cat.id },
            onClick: (e) => handleFilterClick(e, screen, data)
        }, cat.name.toUpperCase()));
    });
    screen.appendChild(filters);

    /* --- GRID --- */
    const gridHost = el('div', { id: 'tricks-grid-host' });
    screen.appendChild(gridHost);

    container.appendChild(screen);

    renderGrid(screen, data);
}

function handleFilterClick(e, screen, data) {
    const btn = e.currentTarget;
    currentFilter = btn.dataset.filter;
    screen.querySelectorAll('.tricks-filters .chip').forEach((c) => c.classList.remove('is-active'));
    btn.classList.add('is-active');
    renderGrid(screen, data);
}

function renderGrid(screen, data) {
    const host = screen.querySelector('#tricks-grid-host');
    if (!host) return;
    host.innerHTML = '';

    const favs = new Set(getFavorites());
    const nSearch = norm(currentSearch);

    let list = data.tricks.slice();

    // filtro categoria
    if (currentFilter !== 'all') {
        list = list.filter((t) => t.category === currentFilter);
    }
    // filtro busca
    if (nSearch) {
        list = list.filter((t) => {
            const fields = [t.name, t.category, ...(t.tags || [])].map(norm).join(' ');
            return fields.includes(nSearch);
        });
    }

    // favoritos primeiro
    list.sort((a, b) => {
        const fa = favs.has(a.id) ? 0 : 1;
        const fb = favs.has(b.id) ? 0 : 1;
        if (fa !== fb) return fa - fb;
        return a.name.localeCompare(b.name);
    });

    if (list.length === 0) {
        host.appendChild(el('div', { className: 'tricks-empty' },
            el('div', { className: 'tricks-empty-title' }, 'nada por aqui'),
            el('p', {}, 'tenta outra categoria ou outra busca.')
        ));
        return;
    }

    const grid = el('div', { className: 'tricks-grid stagger' });

    list.forEach((t, i) => {
        const isFav = favs.has(t.id);
        const avg = getProgressAverage(t.id);
        const catName = getCategoryName(data, t.category);

        const card = el('button', {
            className: `trick-card${isFav ? ' is-favorite' : ''}`,
            style: { '--i': Math.min(i, 15) },
            dataset: { trickId: t.id },
            onClick: () => navigate('trickDetail', { id: t.id }),
            'aria-label': `Abrir manobra ${t.name}`
        },
            el('span', { className: 'trick-category-tag' }, catName),
            el('div', { className: 'trick-name' }, t.name),
            renderDifficulty(t.difficulty || 1),
            renderMiniProgress(avg)
        );

        grid.appendChild(card);
    });

    host.appendChild(grid);
}

function renderDifficulty(level) {
    const wrap = el('div', { className: 'trick-difficulty', 'aria-label': `Dificuldade ${level} de 5` });
    for (let i = 1; i <= 5; i++) {
        wrap.appendChild(el('span', {
            className: `difficulty-dot${i <= level ? ' is-filled' : ''}`,
            'aria-hidden': 'true'
        }));
    }
    return wrap;
}

function renderMiniProgress(avg) {
    const wrap = el('div', { className: 'trick-progress-mini', 'aria-label': `Progresso médio ${avg} de 5` });
    for (let i = 1; i <= 5; i++) {
        wrap.appendChild(el('span', {
            className: `trick-progress-mini-seg${i <= avg ? ' is-filled' : ''}`,
            'aria-hidden': 'true'
        }));
    }
    return wrap;
}

function getCategoryName(data, id) {
    const c = data.categories.find((x) => x.id === id);
    return c ? c.name.toUpperCase() : id.toUpperCase();
}

export default { render };
