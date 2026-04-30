/**
 * screens/home.js
 * Tela inicial — capa do zine.
 */

import { el, pick, fetchJson } from '../utils.js';
import { navigate } from '../navigation.js';
import { getFavorites, get, STORAGE_KEYS } from '../storage.js';
import * as daily from '../daily-suggestion.js';

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
     * colocar imagens em assets/stickers/home-{1-4}.*
     * Tap no adesivo faz ele "cair" (fita se despega, rotação).
     * Tap de novo devolve pra posição. */
    ['tl', 'tr', 'bl', 'br'].forEach((pos, i) => {
        const slot = el('div', {
            className: `sticker-slot sticker-slot-${pos}`,
            dataset: { slotIndex: String(i + 1), pos: pos },
            role: 'button',
            tabindex: '0',
            'aria-label': `Adesivo ${i + 1}`,
            onClick: () => toggleStickerFall(slot, pos),
            onKeyDown: (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleStickerFall(slot, pos);
                }
            }
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
            action:  () => navigate('game')
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
        },
        {
            title:   'Som',
            stat:    'SUA TRILHA',
            action:  () => navigate('music')
        }
    ];

    const grid = el('div', { className: 'home-grid stagger' });
    cards.forEach((c, i) => {
        const card = el('button', {
            className: 'home-card',
            style: { '--i': i },
            onClick: () => crushAndExecute(card, c.action),
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

    /* --- MANDA HOJE — sugestão diária --- */
    const dailyBox = el('div', { className: 'home-daily', id: 'home-daily' });
    screen.appendChild(dailyBox);
    renderDailySuggestion(dailyBox);

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

    if (logoClickCount >= 3) {
        logoClickCount = 0;
        triggerEasterEgg();
    }
}

async function triggerEasterEgg() {
    const storage = await import('../storage.js');
    const before = storage.getUnlockedBots();
    const newOnes = ['guh', 'peh', 'feh'].filter(id => !before.includes(id));
    if (newOnes.length > 0) {
        storage.unlockBots(newOnes);
        showUnlockToast('Wihh, guhh, fehh, pehh. ❤️', 'novos adversários liberados');
    } else {
        // já desbloqueou: só mostra a mensagem afetiva
        showUnlockToast('Wihh, guhh, fehh, pehh. ❤️', null);
    }
}

function showUnlockToast(line1, line2) {
    const t = el('div', { className: 'toast toast-easter-egg' });
    t.appendChild(el('div', {}, line1));
    if (line2) {
        t.appendChild(el('div', { className: 'toast-easter-egg-sub' }, line2));
    }
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
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

/* Animação "amassar" ao clicar num card da home.
 * 1. Adiciona classe is-crushing (CSS faz o card "amassar" — escala,
 *    rotacionar, distorcer, e ir murchando).
 * 2. Depois de ~600ms, executa a action (navegar/toast).
 * Protege contra duplo-clique. */
let isCrushing = false;
function crushAndExecute(cardEl, action) {
    if (isCrushing) return;
    isCrushing = true;

    // respeita reduced-motion: executa imediato sem animação
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
        action();
        isCrushing = false;
        return;
    }

    cardEl.classList.add('is-crushing');
    setTimeout(() => {
        cardEl.classList.remove('is-crushing');
        isCrushing = false;
        action();
    }, 500);
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

/* Ao clicar no adesivo, ele "cai":
 * - a fita de cima despega (animação separada)
 * - o adesivo rotaciona bruscamente pra lado aleatório
 * - desliza pra baixo alguns pixels
 * Clique novo devolve pra posição. */
function toggleStickerFall(slotEl, pos) {
    const isFallen = slotEl.classList.contains('is-fallen');
    if (isFallen) {
        // volta — restaura posição
        slotEl.classList.remove('is-fallen');
        slotEl.classList.add('is-restoring');
        setTimeout(() => slotEl.classList.remove('is-restoring'), 500);
    } else {
        // cai — direção depende da posição original
        const fallDir = pos.includes('l') ? 'left' : 'right';
        slotEl.dataset.fallDir = fallDir;
        slotEl.classList.add('is-falling');
        // depois da animação, marca como caído (estado final)
        setTimeout(() => {
            slotEl.classList.remove('is-falling');
            slotEl.classList.add('is-fallen');
        }, 700);
    }
}

/* =========================================================
   MANDA HOJE — sugestão diária na home
   ========================================================= */

async function renderDailySuggestion(container) {
    let tricksData;
    try {
        tricksData = await fetchJson('data/tricks.json');
    } catch (e) {
        return;
    }

    const sugg = daily.getOrGenerateDaily(tricksData);
    container.innerHTML = '';

    if (!sugg.trickIds || sugg.trickIds.length === 0) {
        return;
    }

    const wrap = el('div', { className: 'home-daily-card' });
    wrap.appendChild(el('h2', { className: 'home-daily-title' }, 'MANDA HOJE'));
    wrap.appendChild(el('p', { className: 'home-daily-sub' }, 'sugestão pra quebrar a estagnação'));

    const tricks = sugg.trickIds.map(id => tricksData.tricks.find(t => t.id === id)).filter(Boolean);
    const list = el('div', { className: 'home-daily-tricks' });
    tricks.forEach(t => {
        const tried = daily.attemptedToday(t.id);
        const card = el('div', { className: `home-daily-trick${tried ? ' is-attempted' : ''}` });
        card.appendChild(el('div', { className: 'home-daily-trick-name' }, t.name));
        if (t.difficulty) {
            card.appendChild(el('div', { className: 'home-daily-trick-diff' }, 'dificuldade ' + t.difficulty));
        }
        const acts = el('div', { className: 'home-daily-actions' });
        acts.appendChild(el('button', {
            className: 'home-daily-btn home-daily-open', type: 'button',
            onClick: () => navigate('trickDetail', { id: t.id })
        }, 'ABRIR'));
        if (tried) {
            acts.appendChild(el('span', { className: 'home-daily-tried' }, '✓ tentei hoje'));
        } else {
            acts.appendChild(el('button', {
                className: 'home-daily-btn home-daily-tried-btn', type: 'button',
                onClick: () => {
                    daily.markAttempt(t.id);
                    renderDailySuggestion(container);
                }
            }, 'TENTEI HOJE'));
        }
        card.appendChild(acts);
        list.appendChild(card);
    });
    wrap.appendChild(list);
    container.appendChild(wrap);
}

export default { render };
