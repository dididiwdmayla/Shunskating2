/**
 * screens/trick-detail.js
 * Tela de detalhe de manobra: 4 stances, dicas, progresso, notas, favoritos, highlights.
 */

import { el, debounce, fetchJson, levelLabel } from '../utils.js';
import { navigate } from '../navigation.js';
import {
    getProgress, setProgress,
    getNote, setNote,
    getFavorites, toggleFavorite,
    getHighlights, setHighlights
} from '../storage.js';

let tricksData = null;
const STANCES = ['regular', 'switch', 'fakie', 'nollie'];
const HIGHLIGHT_COLORS = [
    { id: 'yellow', css: '#f4e542' },
    { id: 'pink',   css: '#c86b8a' },
    { id: 'red',    css: '#c8201f' }
];

async function loadTricks() {
    if (tricksData) return tricksData;
    tricksData = await fetchJson('data/tricks.json');
    return tricksData;
}

async function render(container, params) {
    const data = await loadTricks();
    const trick = data.tricks.find((t) => t.id === params.id);

    if (!trick) {
        container.appendChild(el('div', { className: 'screen-trick-detail' },
            el('button', { className: 'btn-back', onClick: () => navigate('tricks') }, '← VOLTAR'),
            el('h1', { className: 'detail-title' }, 'NÃO ENCONTRADA'),
            el('p', {}, 'Essa manobra não existe no catálogo.')
        ));
        return;
    }

    const state = {
        trick,
        stance: STANCES[0],
        isFav: getFavorites().includes(trick.id)
    };

    const screen = el('div', { className: 'screen-trick-detail' });

    /* --- HEADER --- */
    screen.appendChild(el('div', { className: 'detail-header' },
        el('button', {
            className: 'btn-back detail-back',
            onClick: () => navigate('tricks'),
            'aria-label': 'Voltar ao catálogo'
        }, '← VOLTAR'),
        renderFavoriteStar(state)
    ));

    /* --- TÍTULO + SUBTÍTULO --- */
    screen.appendChild(el('h1', { className: 'detail-title xerox-tremor' }, trick.name));
    screen.appendChild(el('div', { className: 'detail-subtitle' },
        el('span', {}, getCategoryName(data, trick.category).toUpperCase()),
        el('span', { className: 'sep' }, '//'),
        renderDifficulty(trick.difficulty || 1)
    ));

    /* --- TABS DE STANCE --- */
    const tabs = el('div', { className: 'stance-tabs', role: 'tablist' });
    STANCES.forEach((s) => {
        tabs.appendChild(el('button', {
            className: `stance-tab${s === state.stance ? ' is-active' : ''}`,
            role: 'tab',
            'aria-selected': s === state.stance ? 'true' : 'false',
            dataset: { stance: s },
            onClick: () => switchStance(screen, state, s)
        }, s.toUpperCase()));
    });
    screen.appendChild(tabs);

    /* --- CONTEÚDO DE DICAS --- */
    const contentHost = el('div', { id: 'detail-content-host' });
    screen.appendChild(contentHost);

    container.appendChild(screen);

    renderStanceContent(screen, state);
}

/* ---------------- RENDER DE CONTEÚDO POR STANCE ---------------- */

function renderStanceContent(screen, state) {
    const host = screen.querySelector('#detail-content-host');
    if (!host) return;
    host.innerHTML = '';

    const { trick, stance } = state;

    // qual HTML renderizar: regular/switch = tips, fakie/nollie = tipsFakie (fallback em tips)
    const useFakie = stance === 'fakie' || stance === 'nollie';
    const tipsHtml = useFakie ? (trick.tipsFakie || trick.tips || '') : (trick.tips || '');

    // conteúdo das dicas
    const content = el('article', {
        className: 'detail-content',
        html: tipsHtml
    });
    host.appendChild(content);

    // reaplicar highlights salvos
    applyHighlights(content, state);

    // capturar seleção de texto pra toolbar de highlight
    enableHighlightSelection(content, state);

    // progresso
    host.appendChild(renderProgressSection(state));

    // notas
    host.appendChild(renderNotesSection(state));
}

/* ---------------- FAVORITO ---------------- */

function renderFavoriteStar(state) {
    const btn = el('button', {
        className: `favorite-star${state.isFav ? ' is-favorite' : ''}`,
        'aria-label': state.isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos',
        onClick: () => {
            const isFav = toggleFavorite(state.trick.id);
            state.isFav = isFav;
            btn.classList.toggle('is-favorite', isFav);
            btn.setAttribute('aria-label', isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos');
            btn.classList.remove('anim-stamp');
            void btn.offsetWidth;
            btn.classList.add('anim-stamp');
        }
    });
    // estrela SVG
    btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linejoin="round">
            <polygon points="12,2 15,9 22,9.5 16.5,14.5 18,22 12,18 6,22 7.5,14.5 2,9.5 9,9"/>
        </svg>
    `;
    return btn;
}

/* ---------------- TROCA DE STANCE ---------------- */

function switchStance(screen, state, stance) {
    if (state.stance === stance) return;
    state.stance = stance;
    screen.querySelectorAll('.stance-tab').forEach((t) => {
        const is = t.dataset.stance === stance;
        t.classList.toggle('is-active', is);
        t.setAttribute('aria-selected', is ? 'true' : 'false');
    });
    renderStanceContent(screen, state);
}

/* ---------------- PROGRESSO ---------------- */

function renderProgressSection(state) {
    const { trick, stance } = state;
    const current = getProgress(trick.id, stance);

    const section = el('div', { className: 'detail-section' });
    section.appendChild(el('h3', { className: 'detail-section-title' }, 'PROGRESSO'));

    const bar = el('div', {
        className: 'progress-bar',
        role: 'slider',
        'aria-valuemin': '0',
        'aria-valuemax': '5',
        'aria-valuenow': String(current),
        'aria-label': `Progresso em ${stance}`
    });
    for (let i = 1; i <= 5; i++) {
        bar.appendChild(el('button', {
            className: `progress-seg${i <= current ? ' is-filled' : ''}`,
            dataset: { level: i },
            'aria-label': `Nível ${i}: ${levelLabel(i)}`,
            onClick: (e) => handleProgressClick(e, state, section)
        }));
    }
    section.appendChild(bar);

    const label = el('span', { className: 'detail-progress-label' },
        current === 0 ? '— ainda não marquei —' : `nível ${current} · ${levelLabel(current)}`
    );
    section.appendChild(label);

    const labels = el('div', { className: 'progress-labels' },
        el('span', {}, 'TENTEI'),
        el('span', {}, ''),
        el('span', {}, 'LIMPO'),
        el('span', {}, ''),
        el('span', {}, 'DOMINADO')
    );
    section.appendChild(labels);

    return section;
}

function handleProgressClick(e, state, section) {
    const level = parseInt(e.currentTarget.dataset.level, 10);
    const current = getProgress(state.trick.id, state.stance);
    // clique no mesmo nível atual zera; senão seta o nível clicado
    const newLevel = level === current ? 0 : level;
    setProgress(state.trick.id, state.stance, newLevel);

    // atualiza visual sem re-renderizar tudo
    const segs = section.querySelectorAll('.progress-seg');
    segs.forEach((s, idx) => s.classList.toggle('is-filled', (idx + 1) <= newLevel));
    const label = section.querySelector('.detail-progress-label');
    if (label) label.textContent = newLevel === 0 ? '— ainda não marquei —' : `nível ${newLevel} · ${levelLabel(newLevel)}`;
    const bar = section.querySelector('.progress-bar');
    if (bar) bar.setAttribute('aria-valuenow', String(newLevel));

    // animação de carimbo no segmento
    if (newLevel > 0 && segs[newLevel - 1]) {
        segs[newLevel - 1].classList.remove('anim-stamp');
        void segs[newLevel - 1].offsetWidth;
        segs[newLevel - 1].classList.add('anim-stamp');
    }
}

/* ---------------- NOTAS ---------------- */

function renderNotesSection(state) {
    const { trick, stance } = state;
    const section = el('div', { className: 'detail-section' });
    section.appendChild(el('h3', { className: 'detail-section-title' }, 'ANOTAÇÕES'));

    const textarea = el('textarea', {
        className: 'textarea-notebook',
        placeholder: 'o que você descobriu sobre essa manobra...',
        'aria-label': `Anotação pessoal em ${stance}`
    });
    textarea.value = getNote(trick.id, stance);

    const saveDebounced = debounce((v) => {
        setNote(trick.id, stance, v);
        statusEl.textContent = 'salvo.';
        setTimeout(() => { statusEl.textContent = ''; }, 1800);
    }, 500);

    textarea.addEventListener('input', (e) => {
        statusEl.textContent = 'salvando...';
        saveDebounced(e.target.value);
    });

    section.appendChild(textarea);

    const statusEl = el('small', {
        style: { display: 'block', marginTop: '8px', fontFamily: 'var(--font-typewrite)', letterSpacing: '0.1em', color: 'var(--zine-ink-soft)' }
    });
    section.appendChild(statusEl);

    return section;
}

/* ---------------- HIGHLIGHTS ---------------- */

function enableHighlightSelection(contentEl, state) {
    const toolbar = document.getElementById('highlight-toolbar');
    if (!toolbar) return;

    // monta botões de cor (idempotente)
    toolbar.innerHTML = '';
    HIGHLIGHT_COLORS.forEach((c) => {
        const btn = el('button', {
            className: 'highlight-color',
            style: { backgroundColor: c.css },
            'aria-label': `Destacar em ${c.id}`,
            onClick: () => applySelectionHighlight(contentEl, state, c)
        });
        toolbar.appendChild(btn);
    });

    function showToolbarAt(rect) {
        toolbar.style.top = `${window.scrollY + rect.top}px`;
        toolbar.style.left = `${rect.left + rect.width / 2}px`;
        toolbar.hidden = false;
    }
    function hideToolbar() {
        toolbar.hidden = true;
    }

    const onSelChange = () => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) { hideToolbar(); return; }
        const range = sel.getRangeAt(0);
        // seleção precisa estar dentro do contentEl
        if (!contentEl.contains(range.commonAncestorContainer)) { hideToolbar(); return; }
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) { hideToolbar(); return; }
        showToolbarAt(rect);
    };

    document.addEventListener('selectionchange', onSelChange);

    // clean-up: quando navega pra outra tela, body perde listener no próximo render
}

function applySelectionHighlight(contentEl, state, color) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!contentEl.contains(range.commonAncestorContainer)) return;

    // guarda posição da seleção em offsets do contentEl antes de modificar o DOM
    const { start, end } = getRangeOffsets(contentEl, range);
    const text = sel.toString();

    // envolve a seleção em span
    const span = document.createElement('span');
    span.className = 'user-highlight';
    span.style.backgroundColor = color.css;
    span.dataset.hlColor = color.id;

    try {
        range.surroundContents(span);
    } catch (err) {
        // seleção cruza fronteiras de nós — fallback: extrai + envolve
        const frag = range.extractContents();
        span.appendChild(frag);
        range.insertNode(span);
    }

    // listener de remoção
    span.addEventListener('click', (e) => {
        if (confirm('Remover este destaque?')) {
            const parent = span.parentNode;
            while (span.firstChild) parent.insertBefore(span.firstChild, span);
            parent.removeChild(span);
            parent.normalize();
            saveHighlightsFromDom(contentEl, state);
        }
    });

    // salva
    const all = getHighlights(state.trick.id, state.stance);
    all.push({ start, end, color: color.id, text });
    setHighlights(state.trick.id, state.stance, all);

    // fecha seleção e toolbar
    sel.removeAllRanges();
    const toolbar = document.getElementById('highlight-toolbar');
    if (toolbar) toolbar.hidden = true;
}

/** Calcula offset de início/fim da range dentro do contentEl (texto puro). */
function getRangeOffsets(contentEl, range) {
    const pre = document.createRange();
    pre.selectNodeContents(contentEl);
    pre.setEnd(range.startContainer, range.startOffset);
    const start = pre.toString().length;
    const end = start + range.toString().length;
    return { start, end };
}

/** Reaplica highlights salvos no DOM já renderizado. */
function applyHighlights(contentEl, state) {
    const list = getHighlights(state.trick.id, state.stance);
    if (!list || list.length === 0) return;

    // ordena do maior offset pro menor pra não invalidar os seguintes ao modificar DOM
    const sorted = list.slice().sort((a, b) => b.start - a.start);

    sorted.forEach((hl) => {
        const range = createRangeFromOffsets(contentEl, hl.start, hl.end);
        if (!range) return;

        const color = HIGHLIGHT_COLORS.find((c) => c.id === hl.color) || HIGHLIGHT_COLORS[0];
        const span = document.createElement('span');
        span.className = 'user-highlight';
        span.style.backgroundColor = color.css;
        span.dataset.hlColor = color.id;

        try {
            range.surroundContents(span);
        } catch (err) {
            const frag = range.extractContents();
            span.appendChild(frag);
            range.insertNode(span);
        }

        span.addEventListener('click', () => {
            if (confirm('Remover este destaque?')) {
                const parent = span.parentNode;
                while (span.firstChild) parent.insertBefore(span.firstChild, span);
                parent.removeChild(span);
                parent.normalize();
                saveHighlightsFromDom(contentEl, state);
            }
        });
    });
}

/** Cria range a partir de offsets de texto dentro do contentEl. */
function createRangeFromOffsets(contentEl, start, end) {
    let pos = 0;
    const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT, null);
    let startNode = null, startOff = 0, endNode = null, endOff = 0;

    let node;
    while ((node = walker.nextNode())) {
        const len = node.nodeValue.length;
        if (!startNode && pos + len >= start) {
            startNode = node;
            startOff = start - pos;
        }
        if (!endNode && pos + len >= end) {
            endNode = node;
            endOff = end - pos;
            break;
        }
        pos += len;
    }

    if (!startNode || !endNode) return null;

    try {
        const range = document.createRange();
        range.setStart(startNode, startOff);
        range.setEnd(endNode, endOff);
        return range;
    } catch (err) {
        return null;
    }
}

/** Recalcula lista de highlights a partir dos spans existentes e salva. */
function saveHighlightsFromDom(contentEl, state) {
    const spans = contentEl.querySelectorAll('.user-highlight');
    const list = [];
    spans.forEach((span) => {
        const range = document.createRange();
        range.selectNodeContents(span);
        const pre = document.createRange();
        pre.selectNodeContents(contentEl);
        pre.setEnd(range.startContainer, range.startOffset);
        const start = pre.toString().length;
        const end = start + span.textContent.length;
        list.push({
            start,
            end,
            color: span.dataset.hlColor || 'yellow',
            text: span.textContent
        });
    });
    setHighlights(state.trick.id, state.stance, list);
}

/* ---------------- HELPERS ---------------- */

function renderDifficulty(level) {
    const wrap = el('span', { className: 'detail-difficulty', 'aria-label': `Dificuldade ${level} de 5` });
    for (let i = 1; i <= 5; i++) {
        wrap.appendChild(el('span', { className: `difficulty-dot${i <= level ? ' is-filled' : ''}` }));
    }
    return wrap;
}

function getCategoryName(data, id) {
    const c = data.categories.find((x) => x.id === id);
    return c ? c.name : id;
}

export default { render };
