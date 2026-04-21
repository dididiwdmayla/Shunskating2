/**
 * screens/bomb-ideas.js
 *
 * BOMBA DE IDEIAS — variância sobre precisão.
 *
 * Ideia de design: quando você tá travado numa manobra, o que você precisa
 * não é a "explicação definitiva" — é uma explosão de ângulos diferentes.
 * 1-2 das ideias servem, o resto é descartável. É isso que destrava.
 *
 * 5 categorias misturadas propositalmente:
 *   - pe          (onde encostar / distribuir peso)
 *   - reframe     (forma diferente de pensar a manobra)
 *   - ritmo       (timing, velocidade, respiração)
 *   - erro        (se tá acontecendo X, provavelmente é por Y)
 *   - experimento (o absurdo que às vezes funciona)
 *
 * Fonte: ideias específicas da manobra (prioridade) + ideias genéricas
 * da categoria (flatground/slides/grinds/etc).
 */

import { el } from '../utils.js';
import { getBombUseful, toggleBombUseful } from '../storage.js';

const IDEAS_PER_EXPLOSION = 3;
const MAX_EXPLOSION_ATTEMPTS = 50; // safety pra sorteio sem repetição

/* =========================================================
   BOTÃO-BOMBA (renderizado ao lado das tabs de stance)
   ========================================================= */

/**
 * Cria o botão-bomba que detona a explosão.
 * @param {object} trick - objeto da manobra atual
 * @param {object} tricksData - json completo (para pool genérico)
 */
export function renderBombButton(trick, tricksData) {
    const btn = el('button', {
        className: 'bomb-trigger',
        type: 'button',
        'aria-label': 'Bomba de ideias — sugestões pra destravar essa manobra',
        title: 'BOMBA DE IDEIAS',
        onClick: () => openBombOverlay(trick, tricksData)
    });

    // ícone bomba SVG — desenho rabiscado, não geométrico
    btn.innerHTML = `
        <svg viewBox="-4 -4 44 44" aria-hidden="true" class="bomb-svg">
            <!-- corpo da bomba (círculo irregular) -->
            <path class="bomb-body" d="M 20 35
                C 10 35, 5 28, 6 20
                C 7 12, 13 8, 20 8.5
                C 28 9, 33 14, 33 21
                C 33 29, 28 35, 20 35 Z" />
            <!-- brilho -->
            <ellipse class="bomb-shine" cx="15" cy="16" rx="3" ry="4" />
            <!-- pavio (linha curva) -->
            <path class="bomb-fuse" d="M 22 9 C 24 5, 27 4, 29 2" />
            <!-- faísca no topo -->
            <g class="bomb-spark">
                <circle cx="29" cy="2" r="2" />
                <line x1="29" y1="2" x2="32" y2="-1" />
                <line x1="29" y1="2" x2="26" y2="-1" />
                <line x1="29" y1="2" x2="32" y2="4" />
                <line x1="29" y1="2" x2="26" y2="4" />
            </g>
        </svg>
        <span class="bomb-label">BOMBA</span>
    `;

    return btn;
}

/* =========================================================
   SORTEIO DE IDEIAS (variância proposital)
   ========================================================= */

/**
 * Monta o pool de ideias disponíveis para uma manobra.
 * Específicas + genéricas da categoria, sem duplicatas.
 */
function buildPool(trick, tricksData) {
    const specific = trick.bombIdeas || [];
    const generic = (tricksData.bombIdeasGeneric && tricksData.bombIdeasGeneric[trick.category]) || [];

    // marca origem pra eventual debug/estilização
    const pool = [
        ...specific.map(i => ({ ...i, source: 'specific' })),
        ...generic.map(i => ({ ...i, source: 'generic' }))
    ];

    // dedup por texto (se alguma específica coincidir com genérica)
    const seen = new Set();
    return pool.filter(i => {
        if (seen.has(i.text)) return false;
        seen.add(i.text);
        return true;
    });
}

/**
 * Sorteia N ideias do pool com variância proposital:
 *  - tenta pegar de categorias diferentes
 *  - prioriza 'specific' sobre 'generic' quando houver empate de categoria
 *  - nunca repete texto dentro da mesma explosão
 *  - (idealmente) não repete ideias do sorteio anterior
 *
 * Retorna { ideas, didReset }. Se didReset=true, o pool foi esgotado e
 * o excludeSet deve ser resetado pelo chamador.
 */
export function sortIdeas(trick, tricksData, excludeSet = new Set()) {
    const pool = buildPool(trick, tricksData);
    if (pool.length === 0) return { ideas: [], didReset: false };

    // agrupa por categoria
    const byCategory = {};
    for (const idea of pool) {
        if (excludeSet.has(idea.text)) continue;
        if (!byCategory[idea.category]) byCategory[idea.category] = [];
        byCategory[idea.category].push(idea);
    }

    // se o exclude comeu tudo, libera (reset) e sinaliza
    const categories = Object.keys(byCategory);
    if (categories.length === 0) {
        const fresh = sortIdeas(trick, tricksData, new Set());
        return { ideas: fresh.ideas, didReset: true };
    }

    // embaralha a ordem das categorias pra não ser sempre "pe primeiro"
    shuffle(categories);

    // dentro de cada categoria, embaralha as ideias e prioriza 'specific'
    for (const cat of categories) {
        byCategory[cat].sort((a, b) => {
            if (a.source === b.source) return Math.random() - 0.5;
            return a.source === 'specific' ? -1 : 1;
        });
    }

    const picked = [];
    let catIdx = 0;

    // round-robin nas categorias até pegar N ideias
    let attempts = 0;
    while (picked.length < IDEAS_PER_EXPLOSION && attempts < MAX_EXPLOSION_ATTEMPTS) {
        const cat = categories[catIdx % categories.length];
        const bucket = byCategory[cat];
        if (bucket && bucket.length > 0) {
            picked.push(bucket.shift());
        }
        catIdx++;
        attempts++;
        // se esgotou todas as categorias, quebra
        const remaining = categories.reduce((sum, c) => sum + (byCategory[c].length || 0), 0);
        if (remaining === 0) break;
    }

    // se não conseguiu encher 3 (pool pós-exclude pequeno), reseta e completa
    if (picked.length < IDEAS_PER_EXPLOSION && excludeSet.size > 0) {
        const pickedTexts = new Set(picked.map(i => i.text));
        const fresh = sortIdeas(trick, tricksData, pickedTexts);
        return { ideas: [...picked, ...fresh.ideas].slice(0, IDEAS_PER_EXPLOSION), didReset: true };
    }

    return { ideas: picked, didReset: false };
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/* =========================================================
   OVERLAY DE EXPLOSÃO
   ========================================================= */

let currentOverlay = null;
let lastIdeasTexts = new Set(); // evita repetir na mesma sessão

function openBombOverlay(trick, tricksData) {
    // se já tem overlay aberta, fecha antes (defensivo)
    if (currentOverlay) closeBombOverlay();

    // monta overlay
    const overlay = el('div', {
        className: 'bomb-overlay',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': `Bomba de ideias para ${trick.name}`,
        tabindex: '-1'
    });

    // backdrop — fecha ao tocar fora
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeBombOverlay();
    });

    // ESC fecha
    const onKey = (e) => {
        if (e.key === 'Escape') closeBombOverlay();
    };
    document.addEventListener('keydown', onKey);
    overlay._onKey = onKey;

    // sorteia ideias iniciais
    const sortResult = sortIdeas(trick, tricksData, lastIdeasTexts);
    if (sortResult.didReset) lastIdeasTexts = new Set();
    const ideas = sortResult.ideas;
    ideas.forEach(i => lastIdeasTexts.add(i.text));

    // estilhaços (será populado pela função de render)
    const shards = el('div', { className: 'bomb-shards' });

    // header
    const header = el('div', { className: 'bomb-header' },
        el('h2', { className: 'bomb-title' },
            el('span', { className: 'bomb-title-main' }, 'BOMBA DE IDEIAS'),
            el('span', { className: 'bomb-title-sub' }, `// ${trick.name.toUpperCase()} //`)
        )
    );

    // footer
    const footer = el('div', { className: 'bomb-footer' },
        el('button', {
            className: 'bomb-btn bomb-btn-again',
            type: 'button',
            onClick: () => reExplode(trick, tricksData, shards)
        }, 'OUTRA BOMBA'),
        el('button', {
            className: 'bomb-btn bomb-btn-close',
            type: 'button',
            onClick: () => closeBombOverlay()
        }, 'VOLTAR PRO CHÃO')
    );

    const card = el('div', { className: 'bomb-card anim-explode' });
    card.appendChild(header);
    card.appendChild(shards);
    card.appendChild(footer);

    overlay.appendChild(card);

    // renderiza estilhaços
    renderShards(shards, ideas, trick);

    document.body.appendChild(overlay);
    document.body.classList.add('is-bomb-open');
    currentOverlay = overlay;

    // foco pra acessibilidade
    requestAnimationFrame(() => overlay.focus());
}

function closeBombOverlay() {
    if (!currentOverlay) return;
    const overlay = currentOverlay;

    // remove listener de teclado
    if (overlay._onKey) document.removeEventListener('keydown', overlay._onKey);

    // animação de fade-out
    overlay.classList.add('is-closing');
    setTimeout(() => {
        overlay.remove();
        document.body.classList.remove('is-bomb-open');
    }, 200);

    currentOverlay = null;
}

function reExplode(trick, tricksData, shardsContainer) {
    const result = sortIdeas(trick, tricksData, lastIdeasTexts);
    if (result.didReset) lastIdeasTexts = new Set();
    const ideas = result.ideas;

    // defensivo: se mesmo após reset não tem nada, aborta sem quebrar
    if (ideas.length === 0) return;

    ideas.forEach(i => lastIdeasTexts.add(i.text));

    // anima saída dos antigos + entrada dos novos
    shardsContainer.classList.add('is-reshuffling');
    setTimeout(() => {
        renderShards(shardsContainer, ideas, trick);
        shardsContainer.classList.remove('is-reshuffling');
    }, 180);
}

/* =========================================================
   RENDER DE ESTILHAÇOS
   ========================================================= */

function renderShards(container, ideas, trick) {
    container.innerHTML = '';

    // rotações e offsets pseudo-aleatórios mas estáveis por ideia
    ideas.forEach((idea, idx) => {
        const rotation = randomInRange(-4, 4);
        const offsetX = randomInRange(-8, 8);
        const delay = idx * 80;

        const useful = getBombUseful(trick.id);
        const isUseful = useful.includes(idea.text);

        const shard = el('div', {
            className: `bomb-shard bomb-shard-${idea.category}${isUseful ? ' is-useful' : ''}`,
            style: {
                transform: `rotate(${rotation}deg) translateX(${offsetX}px)`,
                animationDelay: `${delay}ms`
            }
        });

        // tag da categoria (canto superior)
        shard.appendChild(el('span', { className: 'shard-tag' }, categoryLabel(idea.category)));

        // texto da ideia
        shard.appendChild(el('p', { className: 'shard-text' }, idea.text));

        // botão "útil" (marca como útil, some da explosão geral mas fica
        // marcado no storage pra eventual consulta futura)
        const usefulBtn = el('button', {
            className: `shard-useful${isUseful ? ' is-on' : ''}`,
            type: 'button',
            'aria-label': isUseful ? 'Remover marcação de útil' : 'Marcar como útil',
            title: isUseful ? 'Marcado como útil — clique pra desmarcar' : 'Marcar como útil',
            onClick: (e) => {
                e.stopPropagation();
                const nowOn = toggleBombUseful(trick.id, idea.text);
                usefulBtn.classList.toggle('is-on', nowOn);
                shard.classList.toggle('is-useful', nowOn);
                usefulBtn.setAttribute('aria-label', nowOn ? 'Remover marcação de útil' : 'Marcar como útil');
                usefulBtn.setAttribute('title', nowOn ? 'Marcado como útil — clique pra desmarcar' : 'Marcar como útil');
                // micro-animação de carimbo
                usefulBtn.classList.remove('anim-stamp');
                void usefulBtn.offsetWidth;
                usefulBtn.classList.add('anim-stamp');
            }
        });
        // ícone: asterisco estilo zine (não estrela — diferente do favorito de manobra)
        usefulBtn.innerHTML = `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2 L13 10 L20 7 L15 13 L22 15 L14 15 L17 22 L12 17 L7 22 L10 15 L2 15 L9 13 L4 7 L11 10 Z"/>
            </svg>
        `;
        shard.appendChild(usefulBtn);

        container.appendChild(shard);
    });
}

function randomInRange(min, max) {
    return min + Math.random() * (max - min);
}

function categoryLabel(cat) {
    const map = {
        pe: 'pé / posição',
        reframe: 'reframe',
        ritmo: 'ritmo',
        erro: 'diagnóstico',
        experimento: 'experimento'
    };
    return map[cat] || cat;
}

export default {
    renderBombButton,
    sortIdeas
};
