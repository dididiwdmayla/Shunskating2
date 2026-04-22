/**
 * screens/home.js
 * Tela inicial — capa do zine.
 */

import { el, pick } from '../utils.js';
import { navigate } from '../navigation.js';
import { getFavorites, get, STORAGE_KEYS } from '../storage.js';

const QUOTES = [
    { text: 'Tudo que vale a pena, dói um pouco pra aprender.', author: 'Luan Oliveira' },
    { text: 'Skate não é o que você faz. É como você pensa enquanto faz.', author: 'Rodney Mullen' },
    { text: 'O segredo não é a manobra. É a fração de segundo antes dela.', author: '瞬' },
    { text: 'Cai. Levanta. Tenta de novo. Essa é a única técnica que importa.', author: 'Bob Burnquist' },
    { text: 'Estilo é biomecânica assimilada até virar instinto.', author: 'Mike Mo' }
];

function getStats() {
    const progress = get(STORAGE_KEYS.progress, {});
    const favorites = getFavorites();

    let tricksStarted = 0;
    for (const t of Object.values(progress)) {
        const any = ['regular', 'switch', 'fakie', 'nollie'].some((s) => (t[s] || 0) > 0);
        if (any) tricksStarted++;
    }

    return {
        tricks:    tricksStarted,
        favorites: favorites.length
    };
}

function formatEdition() {
    const d = new Date();
    const months = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
    // número da edição: dias desde 1/jan/2026 (origem arbitrária do projeto)
    const origin = new Date(2026, 0, 1);
    const diff = Math.floor((d - origin) / 86400000);
    const edition = String(Math.max(1, diff + 1)).padStart(3, '0');
    const date = `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
    return { edition, date };
}

function render(container) {
    const stats = getStats();
    const quote = pick(QUOTES);
    const { edition, date } = formatEdition();

    const screen = el('div', { className: 'screen-home paper-crumpled' });

    /* --- SLOTS DE ADESIVO (4 posições: TL, TR, BL, BR) ---
     * Ficam vazios com placeholder 瞬 discreto até você
     * colocar imagens em assets/stickers/home-{1-4}.* e
     * descomentar a lógica de carregamento abaixo. */
    ['tl', 'tr', 'bl', 'br'].forEach((pos, i) => {
        const slot = el('div', {
            className: `sticker-slot sticker-slot-${pos}`,
            dataset: { slotIndex: String(i + 1) },
            'aria-hidden': 'true'
        });
        // carrega sticker se existir no disco
        tryLoadSticker(slot, `assets/stickers/home-${i + 1}`);
        screen.appendChild(slot);
    });

    /* --- MASTHEAD --- */
    const masthead = el('header', { className: 'masthead' },
        el('div', { className: 'masthead-meta' },
            el('span', {}, `ED. Nº ${edition}`),
            el('span', {}, `${date} · SARANDI PR`)
        ),
        el('h1', {
            className: 'masthead-logo xerox-tremor',
            onClick: handleLogoClick,
            tabindex: '0',
            role: 'button',
            'aria-label': 'SHUNSKATING'
        }, 'SHUNSKATING'),
        el('div', { className: 'masthead-sub' },
            el('span', { className: 'kanji' }, '瞬'),
            el('span', {}, '· DIÁRIO DE MANOBRAS ·')
        )
    );
    screen.appendChild(masthead);

    /* --- GRID DE SEÇÕES --- */
    const cards = [
        {
            title:   'Catálogo',
            stat:    `${stats.tricks} EM PROGRESSO`,
            action:  () => navigate('tricks')
        },
        {
            title:   'Game',
            stat:    'S.K.A.T.E.',
            action:  () => showComingSoon('game')
        },
        {
            title:   'Metas',
            stat:    'DIÁRIA · SEMANAL',
            action:  () => navigate('metas')
        },
        {
            title:   'Dicas',
            stat:    'FUNDAMENTOS',
            action:  () => navigate('dicas')
        }
    ];

    const grid = el('div', { className: 'home-grid stagger' });
    cards.forEach((c, i) => {
        const card = el('button', {
            className: 'home-card',
            style: { '--i': i },
            onClick: c.action,
            'aria-label': c.title
        },
            el('div', {},
                el('div', { className: 'home-card-title' }, c.title.toUpperCase()),
                el('div', { className: 'home-card-stat' }, c.stat)
            ),
            el('div', { className: 'home-card-arrow' }, 'ABRIR →')
        );
        grid.appendChild(card);
    });
    screen.appendChild(grid);

    /* --- CITAÇÃO --- */
    const quoteBox = el('div', { className: 'home-quote' },
        document.createTextNode(quote.text),
        el('span', { className: 'home-quote-author' }, `— ${quote.author}`)
    );
    screen.appendChild(quoteBox);

    container.appendChild(screen);
}

let logoClickCount = 0;
let logoClickTimer = null;

function handleLogoClick() {
    logoClickCount++;
    clearTimeout(logoClickTimer);
    logoClickTimer = setTimeout(() => { logoClickCount = 0; }, 2000);

    if (logoClickCount >= 5) {
        logoClickCount = 0;
        document.body.classList.toggle('edicao-especial');
        showToast(document.body.classList.contains('edicao-especial') ? 'MODO EDIÇÃO ESPECIAL' : 'EDIÇÃO REGULAR');
    }
}

function showToast(text) {
    const t = el('div', { className: 'toast' }, text);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
}

function showComingSoon(section) {
    const labels = {
        game:  'GAME OF S.K.A.T.E.',
        metas: 'SISTEMA DE METAS',
        dicas: 'TELA DE DICAS'
    };
    showToast(`${labels[section] || section} · EM BREVE`);
}

/* Tenta carregar um adesivo estaticamente a partir de assets/stickers/.
 * Testa várias extensões (png, jpg, webp) e usa a primeira que existir.
 * Se nenhuma existir, o slot fica com o placeholder 瞬 (via CSS :empty).
 */
function tryLoadSticker(slotEl, basePath) {
    const extensions = ['png', 'webp', 'jpg', 'jpeg'];
    let idx = 0;

    function tryNext() {
        if (idx >= extensions.length) return; // nenhuma extensão deu certo
        const url = `${basePath}.${extensions[idx]}`;
        const img = new Image();
        img.onload = () => {
            const imgEl = document.createElement('img');
            imgEl.src = url;
            imgEl.alt = '';
            slotEl.appendChild(imgEl);
        };
        img.onerror = () => {
            idx++;
            tryNext();
        };
        img.src = url;
    }
    tryNext();
}

export default { render };
