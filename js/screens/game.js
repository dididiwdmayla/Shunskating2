/**
 * screens/game.js
 *
 * GAME OF S.K.A.T.E. — jogador vs bot.
 *
 * Fases internas controladas por estado (sem nav separado):
 *   'lobby'  → seletor de bot + bases + histórico + medalhas
 *   'match'  → partida em andamento
 *   'result' → tela de vitória/derrota
 *
 * Regras:
 *   - Setter escolhe manobra e tenta; se acerta, responder tem que fazer igual.
 *   - Se responder erra, pega letra (S → K → A → T → E).
 *   - Se setter erra, passa a vez sem penalidade.
 *   - Setter mantém a vez enquanto o responder acerta.
 *   - Primeiro a completar SKATE perde.
 */

import { el, fetchJson, escapeHtml, stanceLabel } from '../utils.js';
import * as sfx from '../sfx.js';
import {
    getBases, toggleBase, isBase,
    getMatchHistory, saveMatch,
    getBotStats, grantMedal, hasMedal, getMedals,
    getSettings,
    getUnlockedBots, unlockBots
} from '../storage.js';

const LETTERS_BY_WORD = {
    'SKATE': ['S', 'K', 'A', 'T', 'E'],
    'SK8':   ['S', 'K', '8']
};
function lettersFor(word) {
    return (LETTERS_BY_WORD[word] || LETTERS_BY_WORD['SKATE']).slice();
}

let tricksData = null;
let botsData = null;

async function loadData() {
    if (!tricksData) {
        const [main, gameOnly] = await Promise.all([
            fetchJson('data/tricks.json'),
            fetchJson('data/game-tricks.json').catch(() => ({ tricks: [] }))
        ]);
        // mescla: prioriza main (catalogadas) sobre game-only por id
        const ids = new Set(main.tricks.map(t => t.id));
        const extra = (gameOnly.tricks || []).filter(t => !ids.has(t.id));
        tricksData = {
            ...main,
            tricks: [...main.tricks, ...extra]
        };
    }
    if (!botsData) botsData = await fetchJson('data/bots.json');
    return { tricks: tricksData, bots: botsData };
}

/* =========================================================
   RENDER PRINCIPAL (router de fases)
   ========================================================= */

async function render(container, params = {}) {
    const data = await loadData();
    const state = {
        phase: 'lobby',
        container,
        data,
        mode: 'flatground', // 'all' | 'flatground' | 'slides' | 'grinds' | 'slides-grinds'
        gameWord: 'SKATE', // 'SKATE' (5 letras) | 'SK8' (3 letras)
        // match state (preenchido ao iniciar partida)
        match: null
    };
    renderLobby(state);
}

/* =========================================================
   FASE 1 — LOBBY
   ========================================================= */

function renderLobby(state) {
    const { container, data } = state;
    container.innerHTML = '';

    const screen = el('div', { className: 'screen-game screen-game-lobby' });

    // Título
    screen.appendChild(el('h1', { className: 'game-title xerox-tremor' }, 'S.K.A.T.E.'));
    screen.appendChild(el('p', { className: 'game-subtitle' },
        'você vs bot. acerte, responda, ou pegue letra. quem completar ',
        el('strong', {}, 'S.K.A.T.E.'), ' primeiro perde.'
    ));

    // Seção: Modo (filtro de categoria)
    screen.appendChild(el('h2', { className: 'game-section-title' }, 'MODO'));
    screen.appendChild(el('p', { className: 'game-section-desc' },
        'escolhe o tipo de partida. filtra as manobras disponíveis pros dois lados.'
    ));
    const modeRow = el('div', { className: 'game-mode-row' });
    const modes = [
        { id: 'all',           label: 'GERAL' },
        { id: 'flatground',    label: 'FLAT' },
        { id: 'slides',        label: 'SLIDES' },
        { id: 'grinds',        label: 'GRINDS' },
        { id: 'slides-grinds', label: 'SLIDES/GRINDS' }
    ];
    modes.forEach(m => {
        const btn = el('button', {
            className: `game-mode-btn${state.mode === m.id ? ' is-active' : ''}`,
            type: 'button',
            dataset: { mode: m.id },
            onClick: () => {
                state.mode = m.id;
                modeRow.querySelectorAll('.game-mode-btn').forEach(b => {
                    b.classList.toggle('is-active', b.dataset.mode === m.id);
                });
                rebuildBotGrid(state);
            }
        }, m.label);
        modeRow.appendChild(btn);
    });
    screen.appendChild(modeRow);

    function rebuildBotGrid(s) {
        const newGrid = buildBotGrid(s);
        const oldGrid = screen.querySelector('.game-bot-grid');
        if (oldGrid) oldGrid.replaceWith(newGrid);
    }

    /* === Seção: PALAVRA DO JOGO (SKATE / SK8) === */
    screen.appendChild(el('h2', { className: 'game-section-title' }, 'PALAVRA'));
    screen.appendChild(el('p', { className: 'game-section-desc' },
        'quantas letras você aceita levar antes de perder. na última, tem 2 chances pra mesma manobra.'
    ));
    const wordRow = el('div', { className: 'game-mode-row' });
    const words = [
        { id: 'SKATE', label: 'S.K.A.T.E. — 5 letras' },
        { id: 'SK8',   label: 'SK8 — 3 letras' }
    ];
    words.forEach(w => {
        const btn = el('button', {
            className: `game-mode-btn${state.gameWord === w.id ? ' is-active' : ''}`,
            type: 'button',
            dataset: { word: w.id },
            onClick: () => {
                state.gameWord = w.id;
                wordRow.querySelectorAll('.game-mode-btn').forEach(b => {
                    b.classList.toggle('is-active', b.dataset.word === w.id);
                });
            }
        }, w.label);
        wordRow.appendChild(btn);
    });
    screen.appendChild(wordRow);

    // Seção: Escolher oponente
    screen.appendChild(el('h2', { className: 'game-section-title' }, 'ESCOLHE O OPONENTE'));
    screen.appendChild(buildBotGrid(state));

    // Seção: Bases
    screen.appendChild(el('h2', { className: 'game-section-title' }, 'BASES'));
    screen.appendChild(el('p', { className: 'game-section-desc' },
        'suas manobras-chave pro jogo. aparecem no topo do seletor durante a partida.'
    ));
    const basesBtn = el('button', {
        className: 'game-bases-btn',
        type: 'button',
        onClick: () => openBasesEditor(state)
    });
    refreshBasesBtn(basesBtn);
    screen.appendChild(basesBtn);

    // Seção: Medalhas (se houver)
    const medals = getMedals();
    if (medals.length > 0) {
        screen.appendChild(el('h2', { className: 'game-section-title' }, 'MEDALHAS'));
        const medalRow = el('div', { className: 'game-medals-row' });
        medals.forEach(botId => {
            const bot = data.bots.bots.find(b => b.id === botId);
            if (!bot) return;
            medalRow.appendChild(el('div', { className: 'game-medal', title: `Derrotou ${bot.name}` },
                el('span', { className: 'game-medal-label' }, 'DERROTOU'),
                el('span', { className: 'game-medal-name' }, bot.name.toUpperCase())
            ));
        });
        screen.appendChild(medalRow);
    }

    // Seção: Últimas partidas
    const history = getMatchHistory();
    if (history.length > 0) {
        screen.appendChild(el('h2', { className: 'game-section-title' }, 'ÚLTIMAS 5'));
        const histList = el('div', { className: 'game-history-list' });
        history.slice(0, 5).forEach(m => {
            histList.appendChild(renderHistoryItem(m, data));
        });
        screen.appendChild(histList);
    }

    container.appendChild(screen);
}

function buildBotGrid(state) {
    const grid = el('div', { className: 'game-bot-grid' });
    const unlocked = getUnlockedBots();
    state.data.bots.bots.forEach(bot => {
        // bots locked: só mostra se foi desbloqueado
        if (bot.locked && !unlocked.includes(bot.id)) {
            return;
        }
        // no modo filtrado, oculta bots cujo pool fique com <2 manobras
        const effectivePool = filterPoolByMode(bot.pool, state.mode, state.data.tricks);
        if (effectivePool.length < 2) {
            grid.appendChild(renderBotCardDisabled(bot, state));
            return;
        }
        grid.appendChild(renderBotCard(bot, state));
    });
    return grid;
}

/** Retorna trickIds do pool filtrados pelo modo (categoria). 'all' não filtra. */
function filterPoolByMode(poolIds, mode, tricksData) {
    if (mode === 'all') return poolIds.slice();
    if (mode === 'slides-grinds') {
        return poolIds.filter(id => {
            const t = tricksData.tricks.find(x => x.id === id);
            return t && (t.category === 'slides' || t.category === 'grinds');
        });
    }
    return poolIds.filter(id => {
        const t = tricksData.tricks.find(x => x.id === id);
        return t && t.category === mode;
    });
}

function renderBotCard(bot, state) {
    const stats = getBotStats(bot.id);
    const medal = hasMedal(bot.id);
    const classes = [`game-bot-card`, `game-bot-${bot.id}`];
    if (medal) classes.push('has-medal');
    if (bot.special) classes.push('is-special');
    if (bot.id === 'wih') classes.push('is-wih');
    const card = el('button', {
        className: classes.join(' '),
        type: 'button',
        onClick: () => startMatch(state, bot)
    });
    card.appendChild(el('div', { className: 'game-bot-header' },
        el('span', { className: 'game-bot-name' }, bot.name.toUpperCase()),
        medal ? el('span', { className: 'game-bot-medal-dot', 'aria-label': 'Você já venceu' }, '★') : null
    ));
    card.appendChild(el('div', { className: 'game-bot-tagline' }, bot.tagline));
    card.appendChild(el('div', { className: 'game-bot-stats' },
        el('span', {}, `ACC ${Math.round(bot.accuracy * 100)}%`),
        el('span', {}, `${stats.wins}V · ${stats.losses}D`)
    ));
    return card;
}

function renderBotCardDisabled(bot, state) {
    const card = el('div', {
        className: `game-bot-card is-disabled`,
        'aria-disabled': 'true',
        title: 'este bot não tem manobras suficientes pra esse modo'
    });
    card.appendChild(el('div', { className: 'game-bot-header' },
        el('span', { className: 'game-bot-name' }, bot.name.toUpperCase())
    ));
    card.appendChild(el('div', { className: 'game-bot-tagline' }, 'sem pool pra esse modo'));
    card.appendChild(el('div', { className: 'game-bot-stats' }, el('span', {}, '—')));
    return card;
}

function refreshBasesBtn(btn) {
    const bases = getBases();
    btn.innerHTML = '';
    btn.appendChild(el('span', { className: 'game-bases-label' }, '★ GERENCIAR BASES'));
    btn.appendChild(el('span', { className: 'game-bases-count' }, `${bases.length}/10`));
}

function renderHistoryItem(match, data) {
    const bot = data.bots.bots.find(b => b.id === match.botId);
    const botName = bot ? bot.name : '?';
    const resultClass = match.result === 'win' ? 'is-win' : 'is-loss';
    const resultLabel = match.result === 'win' ? 'VITÓRIA' : 'DERROTA';
    const pLetters = match.playerLetters.join('');
    const bLetters = match.botLetters.join('');
    const when = formatRelative(match.endedAt);

    const item = el('div', { className: `game-history-item ${resultClass}` });
    item.appendChild(el('div', { className: 'game-history-top' },
        el('span', { className: 'game-history-result' }, resultLabel),
        el('span', { className: 'game-history-bot' }, `vs ${botName}`),
        el('span', { className: 'game-history-when' }, when)
    ));
    item.appendChild(el('div', { className: 'game-history-letters' },
        el('span', {}, `VOCÊ: ${pLetters || '—'}`),
        el('span', {}, `${botName.toUpperCase()}: ${bLetters || '—'}`)
    ));
    return item;
}

function formatRelative(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `${min}min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d`;
}

/* =========================================================
   EDITOR DE BASES (overlay)
   ========================================================= */

function openBasesEditor(state) {
    const { data } = state;
    const overlay = el('div', {
        className: 'game-overlay',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': 'Gerenciar bases',
        onClick: (e) => { if (e.target === overlay) closeOverlay(overlay, state); }
    });
    const card = el('div', { className: 'game-overlay-card' });

    card.appendChild(el('h2', { className: 'game-overlay-title' },
        el('span', {}, 'BASES'),
        el('span', { className: 'game-overlay-sub' }, `${getBases().length}/10`)
    ));
    card.appendChild(el('p', { className: 'game-overlay-desc' },
        'toca pra marcar/desmarcar. max 10. aparecem primeiro no seletor durante a partida.'
    ));

    const grid = el('div', { className: 'game-trick-picker' });
    function onPick(trick) {
        const res = toggleBase(trick.id);
        if (res.atCap) {
            flashToast('MÁX 10 BASES');
            return;
        }
        card.querySelector('.game-overlay-sub').textContent = `${getBases().length}/10`;
        grid.querySelectorAll('.game-trick-chip').forEach(chip => {
            if (chip.dataset.trickId === trick.id) {
                chip.classList.toggle('is-base', isBase(trick.id));
            }
        });
    }
    appendTrickPickerGroups(grid, data.tricks, {
        filterBases: false,
        onPick,
        highlightBases: true
    });
    card.appendChild(grid);

    const closeBtn = el('button', {
        className: 'game-overlay-close',
        type: 'button',
        onClick: () => closeOverlay(overlay, state)
    }, 'FECHAR');
    card.appendChild(closeBtn);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    document.body.classList.add('is-game-overlay-open');

    const onKey = (e) => { if (e.key === 'Escape') closeOverlay(overlay, state); };
    document.addEventListener('keydown', onKey);
    overlay._onKey = onKey;
}

function closeOverlay(overlay, state) {
    if (overlay._onKey) document.removeEventListener('keydown', overlay._onKey);
    overlay.classList.add('is-closing');
    setTimeout(() => {
        overlay.remove();
        document.body.classList.remove('is-game-overlay-open');
        // re-render lobby se estiver nele (atualiza contador de bases)
        if (state.phase === 'lobby') renderLobby(state);
    }, 180);
}

/* =========================================================
   FASE 2 — MATCH
   ========================================================= */

function startMatch(state, bot) {
    state.phase = 'match';
    const lettersList = lettersFor(state.gameWord);
    state.match = {
        bot,
        mode: state.mode, // snapshot do modo no momento que inicia
        gameWord: state.gameWord, // 'SKATE' | 'SK8'
        lettersList: lettersList, // ['S','K','A','T','E'] ou ['S','K','8']
        playerLetters: [],
        botLetters: [],
        // 'player' ou 'bot': quem é setter atual
        setter: null, // decidido pelo RPS
        // subfase: 'rps' | 'set-pick' | 'set-attempt' | 'resp-attempt' | 'pass-turn'
        subphase: 'rps',
        currentTrick: null, // { trick, stance, side }
        lastChance: null, // {responder, trick} quando em última chance da última letra
        // combos já puxados nesta partida (Set de "trickId|stance|side")
        usedCombos: new Set(),
        log: [],
        startedAt: new Date().toISOString()
    };
    renderMatch(state);
}

/** Serializa combo pra key. */
function comboKey({ trick, stance, side, modifiers }) {
    const mods = (modifiers || []).slice().sort().join(',');
    return `${trick.id}|${stance || 'regular'}|${side || ''}|${mods}`;
}

/** Marca combo como usado após ser puxado com sucesso pelo setter. */
function markComboUsed(state, trickPick) {
    state.match.usedCombos.add(comboKey(trickPick));
}

/** Retorna true se ainda tem pelo menos um combo (trick+stance+side) disponível
 *  pro jogador no modo atual. Usado pra decidir se bloqueia duplicata ou libera. */
function hasAnyAvailableCombo(state) {
    const m = state.match;
    const tricks = state.data.tricks.tricks.filter(t => {
        if (m.mode === 'all') return true;
        if (m.mode === 'slides-grinds') return t.category === 'slides' || t.category === 'grinds';
        return t.category === m.mode;
    });
    const stances = ['regular', 'switch', 'fakie', 'nollie'];
    for (const t of tricks) {
        for (const st of stances) {
            if (t.hasSides) {
                for (const sd of ['fs', 'bs']) {
                    if (!m.usedCombos.has(comboKey({ trick: t, stance: st, side: sd }))) return true;
                }
            } else {
                if (!m.usedCombos.has(comboKey({ trick: t, stance: st, side: undefined }))) return true;
            }
        }
    }
    return false;
}

function renderMatch(state) {
    const { container } = state;
    container.innerHTML = '';

    const screen = el('div', { className: 'screen-game screen-game-match' });

    // Header: scoreboard
    screen.appendChild(renderScoreboard(state));

    // Área central: depende da subfase
    const central = el('div', { className: 'game-central', id: 'game-central' });
    screen.appendChild(central);

    // Log lateral/inferior
    screen.appendChild(renderLog(state));

    // Botão abandonar
    const abandon = el('button', {
        className: 'game-abandon-btn',
        type: 'button',
        onClick: () => {
            if (!confirm('Abandonar a partida? Conta como derrota.')) return;
            finishMatch(state, 'loss', true);
        }
    }, 'ABANDONAR');
    screen.appendChild(abandon);

    state.container.appendChild(screen);

    // renderiza subfase inicial
    renderSubphase(state);
}

function renderScoreboard(state) {
    const m = state.match;
    const board = el('div', { className: 'game-scoreboard' });

    // Jogador
    const pSide = el('div', { className: 'game-side game-side-player' });
    pSide.appendChild(el('div', { className: 'game-side-label' }, 'VOCÊ'));
    pSide.appendChild(renderLetters(m.playerLetters, m.lettersList));
    board.appendChild(pSide);

    // VS
    board.appendChild(el('div', { className: 'game-vs' }, 'VS'));

    // Bot
    const bSide = el('div', { className: 'game-side game-side-bot' });
    bSide.appendChild(el('div', { className: 'game-side-label' }, m.bot.name.toUpperCase()));
    bSide.appendChild(renderLetters(m.botLetters, m.lettersList));
    board.appendChild(bSide);

    return board;
}

function renderLetters(collected, lettersList) {
    const list = lettersList || ['S', 'K', 'A', 'T', 'E'];
    const box = el('div', { className: 'game-letters' });
    list.forEach((L, i) => {
        const got = i < collected.length;
        const cell = el('span', {
            className: `game-letter${got ? ' is-got' : ''}`,
            style: got ? { '--rot': `${(Math.random() * 16 - 8).toFixed(1)}deg` } : null
        }, L);
        box.appendChild(cell);
    });
    return box;
}

function renderLog(state) {
    const wrap = el('div', { className: 'game-log-wrap' });
    wrap.appendChild(el('h3', { className: 'game-log-title' }, 'JOGADAS'));
    const list = el('ol', { className: 'game-log-list', id: 'game-log-list' });
    wrap.appendChild(list);
    refreshLogList(state, list);
    return wrap;
}

function refreshLogList(state, listEl) {
    const list = listEl || document.getElementById('game-log-list');
    if (!list) return;
    list.innerHTML = '';
    if (state.match.log.length === 0) {
        list.appendChild(el('li', { className: 'game-log-empty' }, '— ainda nada —'));
        return;
    }
    // mostra do mais recente pro mais antigo
    [...state.match.log].reverse().forEach(entry => {
        const li = el('li', { className: `game-log-entry game-log-${entry.kind}` }, entry.text);
        list.appendChild(li);
    });
}

function addLog(state, kind, text) {
    state.match.log.push({ kind, text, at: Date.now() });
    refreshLogList(state);
}

/* ---- Subfase router ---- */

function renderSubphase(state) {
    const central = document.getElementById('game-central');
    if (!central) return;
    central.innerHTML = '';
    const m = state.match;

    switch (m.subphase) {
        case 'rps':         return renderRps(state, central);
        case 'set-pick':    return renderSetPick(state, central);
        case 'set-attempt': return renderSetAttempt(state, central);
        case 'resp-attempt':return renderRespAttempt(state, central);
        case 'pass-turn':   return renderPassTurn(state, central);
        case 'between':     return renderBetween(state, central);
    }
}

/* ---- Subfase: RPS (quem começa) ---- */
/* Pedra-papel-tesoura melhor-de-1: jogador escolhe; bot escolhe random.
 * Empate = rejoga. Vencedor escolhe quem puxa primeiro:
 *   simplificação — quem ganhou o RPS É o primeiro setter.
 */

const RPS_CHOICES = ['pedra', 'papel', 'tesoura'];
const RPS_EMOJI = { pedra: '✊', papel: '✋', tesoura: '✌️' };
const RPS_BEATS = { pedra: 'tesoura', papel: 'pedra', tesoura: 'papel' };

function renderRps(state, central) {
    const m = state.match;

    central.appendChild(el('p', { className: 'game-phase-label' }, 'QUEM PUXA PRIMEIRO?'));
    central.appendChild(el('p', { className: 'game-rps-sub' }, 'pedra, papel ou tesoura · vencedor começa'));

    // área de duelo (vazia inicialmente; preenche ao escolher)
    const arena = el('div', { className: 'game-rps-arena' });
    const playerSlot = el('div', { className: 'game-rps-slot' },
        el('div', { className: 'game-rps-label' }, 'VOCÊ'),
        el('div', { className: 'game-rps-hand', id: 'rps-hand-player' }, '?')
    );
    const vs = el('div', { className: 'game-rps-vs' }, 'VS');
    const botSlot = el('div', { className: 'game-rps-slot' },
        el('div', { className: 'game-rps-label' }, m.bot.name.toUpperCase()),
        el('div', { className: 'game-rps-hand', id: 'rps-hand-bot' }, '?')
    );
    arena.appendChild(playerSlot);
    arena.appendChild(vs);
    arena.appendChild(botSlot);
    central.appendChild(arena);

    // botões de escolha
    const choiceRow = el('div', { className: 'game-rps-choices' });
    RPS_CHOICES.forEach(c => {
        const btn = el('button', {
            className: 'game-rps-btn',
            type: 'button',
            dataset: { choice: c },
            'aria-label': c,
            onClick: () => playRps(state, central, c, choiceRow)
        },
            el('span', { className: 'game-rps-btn-emoji' }, RPS_EMOJI[c]),
            el('span', { className: 'game-rps-btn-label' }, c.toUpperCase())
        );
        choiceRow.appendChild(btn);
    });
    central.appendChild(choiceRow);

    // resultado / CTA (revelados no final)
    const resultBox = el('div', { className: 'game-rps-result', id: 'rps-result' });
    central.appendChild(resultBox);
}

function playRps(state, central, playerChoice, choiceRow) {
    // desabilita choices enquanto roda animação
    choiceRow.querySelectorAll('.game-rps-btn').forEach(b => b.setAttribute('disabled', ''));

    const playerHand = document.getElementById('rps-hand-player');
    const botHand = document.getElementById('rps-hand-bot');
    const resultBox = document.getElementById('rps-result');
    resultBox.innerHTML = '';

    // anima "contagem" com hand oscilando
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    playerHand.classList.add('is-shaking');
    botHand.classList.add('is-shaking');
    const shakeFrames = ['✊', '✋', '✌️'];
    let frame = 0;
    const shakeInterval = reduced ? null : setInterval(() => {
        playerHand.textContent = shakeFrames[frame % 3];
        botHand.textContent = shakeFrames[(frame + 1) % 3];
        frame++;
    }, 120);

    const dur = reduced ? 200 : 900;
    setTimeout(() => {
        if (shakeInterval) clearInterval(shakeInterval);
        playerHand.classList.remove('is-shaking');
        botHand.classList.remove('is-shaking');

        const botChoice = RPS_CHOICES[Math.floor(Math.random() * 3)];
        playerHand.textContent = RPS_EMOJI[playerChoice];
        botHand.textContent = RPS_EMOJI[botChoice];

        // determina resultado
        let outcome;
        if (playerChoice === botChoice) outcome = 'draw';
        else if (RPS_BEATS[playerChoice] === botChoice) outcome = 'player';
        else outcome = 'bot';

        if (outcome === 'draw') {
            resultBox.appendChild(el('p', { className: 'game-rps-outcome is-draw' }, 'EMPATE — DE NOVO'));
            // reabilita choices pra rejogar
            setTimeout(() => {
                choiceRow.querySelectorAll('.game-rps-btn').forEach(b => b.removeAttribute('disabled'));
                playerHand.textContent = '?';
                botHand.textContent = '?';
                resultBox.innerHTML = '';
            }, 900);
            return;
        }

        const winner = outcome === 'player' ? 'VOCÊ PUXA PRIMEIRO' : `${state.match.bot.name.toUpperCase()} PUXA PRIMEIRO`;
        state.match.setter = outcome === 'player' ? 'player' : 'bot';
        resultBox.appendChild(el('p', {
            className: `game-rps-outcome ${outcome === 'player' ? 'is-win' : 'is-loss'}`
        }, winner));

        resultBox.appendChild(el('button', {
            className: 'game-primary-btn',
            type: 'button',
            onClick: () => {
                state.match.subphase = 'set-pick';
                renderSubphase(state);
            }
        }, 'BORA'));
    }, dur);
}

/* ---- Subfase: setter escolhe manobra ---- */

function renderSetPick(state, central) {
    const m = state.match;
    if (m.setter === 'player') {
        central.appendChild(el('p', { className: 'game-phase-label' }, 'SUA VEZ · ESCOLHE A MANOBRA'));
        const picker = el('div', { className: 'game-trick-picker' });
        appendTrickPickerGroups(picker, state.data.tricks, {
            filterBases: true,
            highlightBases: true,
            mode: m.mode,
            onPick: (trick) => openVariationPicker(state, trick)
        });
        central.appendChild(picker);
    } else {
        // bot escolhe
        central.appendChild(el('p', { className: 'game-phase-label' }, `${m.bot.name.toUpperCase()} ESTÁ ESCOLHENDO...`));
        central.appendChild(el('div', { className: 'game-thinking' }, '. . .'));
        setTimeout(() => {
            const pick = botPickTrick(m.bot, state.data.tricks, m.mode, m.usedCombos, m.usedCombos.size);
            if (pick.exhausted) {
                addLog(state, 'neutral', 'todas as manobras já foram puxadas · liberado repetir');
            }
            // remove exhausted flag antes de usar
            m.currentTrick = { trick: pick.trick, stance: pick.stance, side: pick.side, modifiers: pick.modifiers || [] };
            m.subphase = 'set-attempt';
            renderSubphase(state);
        }, 900);
    }
}

/* ---- Subfase: setter tenta ---- */

function renderSetAttempt(state, central) {
    const m = state.match;
    const trickLabel = formatTrickLabel(m.currentTrick);

    central.appendChild(el('p', { className: 'game-phase-label' },
        m.setter === 'player' ? 'VOCÊ VAI PUXAR' : `${m.bot.name.toUpperCase()} VAI PUXAR`
    ));
    const stamp = el('div', { className: 'game-trick-stamp game-trick-stamp-setter' }, trickLabel);
    central.appendChild(stamp);

    if (m.setter === 'player') {
        // botões acertou / errou
        const actions = el('div', { className: 'game-action-row' });
        actions.appendChild(el('button', {
            className: 'game-action-btn game-action-hit',
            type: 'button',
            onClick: () => setterResult(state, true)
        }, 'ACERTEI'));
        actions.appendChild(el('button', {
            className: 'game-action-btn game-action-miss',
            type: 'button',
            onClick: () => setterResult(state, false)
        }, 'ERREI'));
        central.appendChild(actions);
    } else {
        // bot rola dado com animação
        animateAttempt(stamp, () => {
            const success = rollBotAccuracy(m.bot, m.currentTrick);
            setterResult(state, success);
        });
    }
}

function setterResult(state, success) {
    const m = state.match;
    const who = m.setter === 'player' ? 'você' : m.bot.name;
    const trickLabel = formatTrickLabel(m.currentTrick);

    if (success) {
        addLog(state, 'hit', `${who} puxou ${trickLabel}`);
        flashStamp('hit');
        markComboUsed(state, m.currentTrick);
        // passa pro responder
        m.subphase = 'resp-attempt';
        setTimeout(() => renderSubphase(state), 700);
    } else {
        addLog(state, 'miss-setter', `${who} errou puxando ${trickLabel}`);
        flashStamp('miss');
        addLog(state, 'neutral', `passou a vez`);
        // vai pra tela de passagem de turno antes de trocar
        m.pendingSwitch = {
            missedBy: m.setter,
            missedTrick: m.currentTrick,
            nextSetter: m.setter === 'player' ? 'bot' : 'player'
        };
        m.subphase = 'pass-turn';
        setTimeout(() => renderSubphase(state), 700);
    }
}

/* ---- Subfase: passagem de turno (alguém errou puxando) ---- */

function renderPassTurn(state, central) {
    const m = state.match;
    const { missedBy, missedTrick, nextSetter } = m.pendingSwitch;
    const whoMissed = missedBy === 'player' ? 'VOCÊ ERROU' : `${m.bot.name.toUpperCase()} ERROU`;
    const nextLabel = nextSetter === 'player' ? 'AGORA É SUA VEZ DE PUXAR' : `${m.bot.name.toUpperCase()} VAI PUXAR AGORA`;
    const trickLabel = formatTrickLabel(missedTrick);

    central.appendChild(el('p', { className: 'game-phase-label' }, whoMissed));
    const stamp = el('div', { className: 'game-pass-stamp' }, 'ERROU');
    central.appendChild(stamp);
    central.appendChild(el('p', { className: 'game-pass-trick' }, trickLabel));
    central.appendChild(el('p', { className: 'game-pass-next' }, nextLabel));

    const continueBtn = el('button', {
        className: 'game-primary-btn',
        type: 'button',
        onClick: () => advanceFromPassTurn(state)
    }, 'CONTINUAR');
    central.appendChild(continueBtn);

    // bot-missed: auto-avança em 1.5s (mas jogador pode clicar antes)
    if (missedBy === 'bot') {
        m._passTurnTimer = setTimeout(() => {
            if (m.subphase === 'pass-turn') advanceFromPassTurn(state);
        }, 1800);
    }
}

function advanceFromPassTurn(state) {
    const m = state.match;
    if (m._passTurnTimer) {
        clearTimeout(m._passTurnTimer);
        m._passTurnTimer = null;
    }
    const { nextSetter } = m.pendingSwitch;
    m.setter = nextSetter;
    m.currentTrick = null;
    m.pendingSwitch = null;
    m.subphase = 'set-pick';
    renderSubphase(state);
}

/* ---- Subfase: responder tenta ---- */

function renderRespAttempt(state, central) {
    const m = state.match;
    const responder = m.setter === 'player' ? 'bot' : 'player';
    const trickLabel = formatTrickLabel(m.currentTrick);

    central.appendChild(el('p', { className: 'game-phase-label' },
        responder === 'player' ? 'REPLIQUE A MANOBRA' : `${m.bot.name.toUpperCase()} VAI REPLICAR`
    ));
    const stamp = el('div', { className: 'game-trick-stamp game-trick-stamp-responder' }, trickLabel);
    central.appendChild(stamp);

    if (responder === 'player') {
        const actions = el('div', { className: 'game-action-row' });
        actions.appendChild(el('button', {
            className: 'game-action-btn game-action-hit',
            type: 'button',
            onClick: () => responderResult(state, true)
        }, 'ACERTEI'));
        actions.appendChild(el('button', {
            className: 'game-action-btn game-action-miss',
            type: 'button',
            onClick: () => responderResult(state, false)
        }, 'ERREI'));
        central.appendChild(actions);
    } else {
        animateAttempt(stamp, () => {
            const success = rollBotAccuracy(m.bot, m.currentTrick);
            responderResult(state, success);
        });
    }
}

function responderResult(state, success) {
    const m = state.match;
    const responder = m.setter === 'player' ? 'bot' : 'player';
    const who = responder === 'player' ? 'você' : m.bot.name;
    const trickLabel = formatTrickLabel(m.currentTrick);

    if (success) {
        addLog(state, 'hit-resp', `${who} respondeu · ACERTOU ${trickLabel}`);
        flashStamp('hit');
        // limpa flag de last-chance se houvesse
        m.lastChance = null;
        // regra real: setter MANTÉM a vez quando responder acerta.
    } else {
        // Verifica se é last chance (segunda tentativa na letra final, mesma manobra)
        const isLastChanceAttempt = m.lastChance && m.lastChance.responder === responder;

        const letters = responder === 'player' ? m.playerLetters : m.botLetters;
        const lettersList = m.lettersList;

        // Calcula se está em matchpoint: próxima letra seria a final
        const willBeMatchpoint = letters.length === lettersList.length - 1;

        if (willBeMatchpoint && !isLastChanceAttempt) {
            // primeira falha na última letra: dá CHANCE EXTRA — mesma manobra de novo
            m.lastChance = {
                responder: responder,
                trick: m.currentTrick // mesma manobra exata
            };
            addLog(state, 'miss-resp', `${who} errou · ⚠️ ÚLTIMA CHANCE — tem mais 1 tentativa na mesma manobra`);
            flashStamp('miss');
            // mantém current trick, força responder a tentar de novo
            setTimeout(() => {
                m.subphase = 'resp-attempt';
                renderSubphase(state);
            }, 900);
            return;
        }

        // Falha normal (ou segunda falha na última chance) → dá letra
        const newLetter = lettersList[letters.length];
        letters.push(newLetter);
        m.lastChance = null;

        const lcSuffix = isLastChanceAttempt ? ' (errou na última chance)' : '';
        addLog(state, 'miss-resp', `${who} errou · +${newLetter}${lcSuffix}`);
        flashStamp('miss');
        setTimeout(() => updateScoreboardLetters(state), 100);

        // checa fim de jogo
        if (letters.length >= lettersList.length) {
            setTimeout(() => {
                // quem completou a palavra perde
                finishMatch(state, responder === 'player' ? 'loss' : 'win', false);
            }, 900);
            return;
        }
        // setter mantém a vez (regra real): continua escolhendo.
    }
    m.currentTrick = null;
    m.subphase = 'set-pick';
    setTimeout(() => renderSubphase(state), 900);
}

function updateScoreboardLetters(state) {
    const screen = state.container.querySelector('.screen-game-match');
    if (!screen) return;
    const board = screen.querySelector('.game-scoreboard');
    if (!board) return;
    const newBoard = renderScoreboard(state);
    board.replaceWith(newBoard);
}

/* ---- Placeholder subphase não usado atualmente ---- */
function renderBetween(state, central) {
    renderSubphase(state);
}

/* =========================================================
   FASE 3 — RESULT
   ========================================================= */

function finishMatch(state, result, abandoned) {
    const m = state.match;
    const match = {
        id: 'match_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        botId: m.bot.id,
        result,
        abandoned: !!abandoned,
        playerLetters: m.playerLetters.slice(),
        botLetters: m.botLetters.slice(),
        gameWord: m.gameWord || 'SKATE',
        lettersList: m.lettersList || ['S','K','A','T','E'],
        startedAt: m.startedAt,
        endedAt: new Date().toISOString(),
        log: m.log.slice()
    };
    saveMatch(match);
    const firstMedal = result === 'win' ? grantMedal(m.bot.id) : false;

    /* Easter egg: ganhar de qualquer um do trio Guh/Peh/Feh desbloqueia o Wih */
    let unlockedWih = false;
    if (result === 'win' && ['guh', 'peh', 'feh'].includes(m.bot.id)) {
        const before = getUnlockedBots();
        if (!before.includes('wih')) {
            unlockBots(['wih']);
            unlockedWih = true;
        }
    }

    state.phase = 'result';
    state.resultData = { match, firstMedal, unlockedWih };
    renderResult(state);
}

function renderResult(state) {
    const { container } = state;
    container.innerHTML = '';
    const { match, firstMedal, unlockedWih } = state.resultData;
    const bot = state.data.bots.bots.find(b => b.id === match.botId);

    const screen = el('div', { className: 'screen-game screen-game-result' });

    const isWin = match.result === 'win';
    screen.appendChild(el('h1', {
        className: `game-result-title xerox-tremor ${isWin ? 'is-win' : 'is-loss'}`
    }, isWin ? 'VITÓRIA' : 'DERROTA'));

    screen.appendChild(el('p', { className: 'game-result-sub' },
        isWin ? `você passou o ${bot.name}` : `o ${bot.name} te pegou`
    ));

    if (firstMedal) {
        screen.appendChild(el('div', { className: 'game-result-medal' },
            el('span', { className: 'game-result-medal-label' }, 'NOVA MEDALHA'),
            el('span', { className: 'game-result-medal-name' }, `DERROTOU ${bot.name.toUpperCase()}`)
        ));
    }

    if (unlockedWih) {
        screen.appendChild(el('div', { className: 'game-result-unlock' },
            el('span', { className: 'game-result-unlock-label' }, '✦ NOVO ADVERSÁRIO ✦'),
            el('span', { className: 'game-result-unlock-name' }, 'WIH'),
            el('span', { className: 'game-result-unlock-desc' }, 'acima do lendário · começa todo game com ollie')
        ));
    }

    // Placar final
    const finalBoard = el('div', { className: 'game-result-board' });
    finalBoard.appendChild(el('div', { className: 'game-result-side' },
        el('div', { className: 'game-result-side-label' }, 'VOCÊ'),
        renderLetters(match.playerLetters, match.lettersList)
    ));
    finalBoard.appendChild(el('div', { className: 'game-result-side' },
        el('div', { className: 'game-result-side-label' }, bot.name.toUpperCase()),
        renderLetters(match.botLetters, match.lettersList)
    ));
    screen.appendChild(finalBoard);

    // Duração
    const dur = Math.max(1, Math.round((new Date(match.endedAt) - new Date(match.startedAt)) / 1000));
    const durText = dur < 60 ? `${dur}s` : `${Math.floor(dur / 60)}min ${dur % 60}s`;
    screen.appendChild(el('p', { className: 'game-result-dur' }, `tempo: ${durText}`));

    // Log completo
    screen.appendChild(el('h3', { className: 'game-result-log-title' }, 'HISTÓRICO DA PARTIDA'));
    const log = el('ol', { className: 'game-result-log' });
    match.log.forEach(entry => {
        log.appendChild(el('li', { className: `game-log-entry game-log-${entry.kind}` }, entry.text));
    });
    screen.appendChild(log);

    // Ações
    const actions = el('div', { className: 'game-result-actions' });
    actions.appendChild(el('button', {
        className: 'game-primary-btn',
        type: 'button',
        onClick: () => startMatch(state, bot)
    }, 'REVANCHE'));
    actions.appendChild(el('button', {
        className: 'game-secondary-btn',
        type: 'button',
        onClick: () => {
            state.phase = 'lobby';
            renderLobby(state);
        }
    }, 'VOLTAR AO LOBBY'));
    screen.appendChild(actions);

    container.appendChild(screen);
}

/* =========================================================
   BOT AI
   ========================================================= */

/* Multiplicadores de stance — afetam a dificuldade efetiva da manobra. */
const STANCE_DIFF_MULT = {
    regular: 1.0,
    fakie:   1.3,
    nollie:  1.7,
    switch:  1.7
};

/* Modifiers (variações extras): adicionam pontos de difficulty. */
const MODIFIER_DIFF_ADD = {
    'late-shove':     1,
    'late-flip':      1.5,
    'body-varial':    1,
    'ollie-north':    0.5,
    'ollie-south':    0.5,
    'grab-indy':      1.5,
    'grab-melon':     2,
    'grab-mute':      2,
    'grab-stalefish': 2.5
};

/** Calcula difficulty efetiva de um pick (com stance + modifiers aplicados). */
function effectiveDifficulty(pick) {
    const baseDiff = pick.trick.difficulty || 2;
    const stanceMult = STANCE_DIFF_MULT[pick.stance] || 1.0;
    const modAdd = (pick.modifiers || []).reduce((s, m) => s + (MODIFIER_DIFF_ADD[m] || 0), 0);
    return baseDiff * stanceMult + modAdd;
}

/** Rola se o bot acerta baseado em accuracy efetiva (ajustada por difficulty efetiva). */
function rollBotAccuracy(bot, pick) {
    const diff = effectiveDifficulty(pick);
    /* Curva por accuracy base — diferença ~15% entre níveis em manobras difíceis:
     *   Wih (0.97):       penalty 0.03 — quase imbatível
     *   Lendário (0.95):  penalty 0.04
     *   Feh/Peh/Guh (0.86-0.88): penalty 0.05 — entre lendário e durão
     *   Durão (0.85):     penalty 0.06
     *   Estiloso (0.82):  penalty 0.08
     *   Técnico (0.78):   penalty 0.10
     *   Amador (0.68):    penalty 0.13
     *   Rookie (0.55):    penalty 0.18 — sofre muito em qualquer coisa difícil
     */
    let penalty;
    if (bot.accuracy >= 0.95) penalty = 0.03;
    else if (bot.accuracy >= 0.90) penalty = 0.04;
    else if (bot.accuracy >= 0.85) penalty = 0.05;
    else if (bot.accuracy >= 0.80) penalty = 0.08;
    else if (bot.accuracy >= 0.74) penalty = 0.10;
    else if (bot.accuracy >= 0.62) penalty = 0.13;
    else penalty = 0.18;

    let acc = bot.accuracy - (diff - 2) * penalty;

    /* Teto de absurdidade: manobras com difficulty efetiva muito alta
     * ficam quase impossíveis até pros melhores */
    if (diff >= 9) acc = Math.min(acc, 0.15);
    if (diff >= 11) acc = Math.min(acc, 0.05);

    if (acc < 0.02) acc = 0.02;
    if (acc > 0.98) acc = 0.98;
    return Math.random() < acc;
}

/** Bot escolhe manobra do pool dele, enviesado pra trick com acc efetiva >= 0.5.
 *  mode filtra o pool pela categoria ('all' = sem filtro).
 *  usedCombos: Set de "trickId|stance|side" já puxados — bot evita repetir.
 *  Retorna { trick, stance, side?, exhausted? } — exhausted=true se teve
 *  que repetir por falta de opção.
 */
function botPickTrick(bot, tricksData, mode = 'all', usedCombos = new Set(), turnIndex = 0) {
    /* Wih sempre abre com ollie regular */
    if (bot.alwaysFirstTrick && turnIndex === 0) {
        const t = tricksData.tricks.find(x => x.id === bot.alwaysFirstTrick);
        if (t) return { trick: t, stance: 'regular', side: t.hasSides ? 'bs' : undefined };
    }

    const effectiveIds = filterPoolByMode(bot.pool, mode, tricksData);
    let pool = effectiveIds
        .map(id => tricksData.tricks.find(t => t.id === id))
        .filter(Boolean);
    if (pool.length === 0) {
        let cand;
        if (mode === 'all') {
            cand = tricksData.tricks;
        } else if (mode === 'slides-grinds') {
            cand = tricksData.tricks.filter(t => t.category === 'slides' || t.category === 'grinds');
        } else {
            cand = tricksData.tricks.filter(t => t.category === mode);
        }
        const source = cand.length > 0 ? cand : tricksData.tricks;
        const t = source[Math.floor(Math.random() * source.length)];
        return { trick: t, stance: 'regular', side: t.hasSides ? 'fs' : undefined };
    }

    // Gera todos os combos (trick × stance × side) possíveis com peso.
    const stances = ['regular', 'switch', 'fakie', 'nollie'];
    const allCombos = [];
    pool.forEach(t => {
        stances.forEach(st => {
            const stW = (bot.stanceBias && bot.stanceBias[st]) || 0;
            if (stW <= 0) return;
            const sides = t.hasSides ? ['fs', 'bs'] : [undefined];
            sides.forEach(sd => {
                const combo = { trick: t, stance: st, side: sd };
                const eDiff = effectiveDifficulty(combo);
                const acc = bot.accuracy - (eDiff - 2) * 0.05;
                let trickWeight = acc >= 0.5 ? 3 : 1;
                /* preferência por manobras-tema do bot (Guh ama heelflips, Peh ama flips, etc) */
                if (bot.preferredTricks && bot.preferredTricks.includes(t.id)) {
                    trickWeight *= 2.2;
                }
                allCombos.push({ combo, weight: trickWeight * stW });
            });
        });
    });

    const available = allCombos.filter(c => !usedCombos.has(comboKey(c.combo)));
    let exhausted = false;
    let source;
    if (available.length === 0) {
        source = allCombos;
        exhausted = true;
    } else {
        source = available;
    }

    const totalW = source.reduce((s, c) => s + c.weight, 0);
    let r = Math.random() * totalW;
    let chosen = source[0];
    for (const c of source) {
        r -= c.weight;
        if (r <= 0) { chosen = c; break; }
    }

    /* Variação espontânea — REGRAS REVISADAS:
     *  - Rookie e Amador: NUNCA adicionam variação
     *  - Técnico/Estiloso/Durão: 8% só em manobras com difficulty <= 2
     *  - Lendário/Guh/Peh/Feh: 12% em difficulty <= 2, 5% em difficulty 3
     *  - Wih: 15% em difficulty <= 2, 7% em difficulty 3
     *  - NINGUÉM adiciona variação em manobras com difficulty >= 4
     * Variações permitidas: pequenas (ollie-north/south, late-shove, body-varial, grab-indy)
     * Grabs pesados (mute, stalefish) só pros 3 melhores. */
    const result = { ...chosen.combo, exhausted };
    const baseDiff = chosen.combo.trick.difficulty || 2;

    if (baseDiff < 4) {
        let chance = 0;
        let allowedMods = ['ollie-north', 'ollie-south'];

        if (bot.id === 'wih') {
            chance = baseDiff <= 2 ? 0.15 : 0.07;
            allowedMods = ['ollie-north', 'ollie-south', 'late-shove', 'body-varial', 'grab-indy', 'grab-melon'];
        } else if (bot.id === 'lendario' || bot.id === 'guh' || bot.id === 'peh' || bot.id === 'feh') {
            chance = baseDiff <= 2 ? 0.12 : 0.05;
            allowedMods = ['ollie-north', 'ollie-south', 'late-shove', 'body-varial', 'grab-indy'];
        } else if (bot.accuracy >= 0.78 && bot.id !== 'rookie' && bot.id !== 'amador') {
            chance = baseDiff <= 2 ? 0.08 : 0;
            allowedMods = ['ollie-north', 'ollie-south', 'late-shove'];
        }

        if (chance > 0 && Math.random() < chance) {
            const availMods = availableModifiersFor(chosen.combo.trick);
            const safeMods = availMods.filter(m => allowedMods.includes(m.id));
            if (safeMods.length > 0) {
                const pickedMod = safeMods[Math.floor(Math.random() * safeMods.length)];
                result.modifiers = [pickedMod.id];
            }
        }
    }

    return result;
}

function weightedPick(bias) {
    const entries = Object.entries(bias).filter(([, w]) => w > 0);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    if (total === 0) return 'regular';
    let r = Math.random() * total;
    for (const [k, w] of entries) {
        r -= w;
        if (r <= 0) return k;
    }
    return entries[0][0];
}

/* =========================================================
   TRICK PICKER (shared entre Bases editor e Match)
   ========================================================= */

function appendTrickPickerGroups(container, tricksData, opts) {
    const { filterBases, highlightBases, onPick, mode = 'all' } = opts;
    const bases = getBases();

    // função local: aplica filtro de modo
    const passesMode = (t) => mode === 'all' || t.category === mode;

    // Primeiro: grupo Bases (se highlightBases e tem pelo menos 1 VÁLIDA pro modo)
    if (highlightBases && bases.length > 0) {
        const baseTricks = bases
            .map(id => tricksData.tricks.find(t => t.id === id))
            .filter(Boolean)
            .filter(passesMode);
        if (baseTricks.length > 0) {
            container.appendChild(el('div', { className: 'game-picker-cat-label game-picker-cat-bases' }, '★ BASES'));
            const grid = el('div', { className: 'game-picker-grid' });
            baseTricks.forEach(t => grid.appendChild(buildTrickChip(t, onPick, true)));
            container.appendChild(grid);
        }
    }

    // Agora: por categoria (respeitando modo)
    const byCategory = {};
    tricksData.tricks.forEach(t => {
        if (!passesMode(t)) return;
        if (!byCategory[t.category]) byCategory[t.category] = [];
        byCategory[t.category].push(t);
    });

    tricksData.categories.forEach(cat => {
        const list = byCategory[cat.id];
        if (!list || list.length === 0) return;
        container.appendChild(el('div', { className: 'game-picker-cat-label' }, cat.name.toUpperCase()));
        const grid = el('div', { className: 'game-picker-grid' });
        list.forEach(t => {
            const isB = isBase(t.id);
            grid.appendChild(buildTrickChip(t, onPick, isB && highlightBases));
        });
        container.appendChild(grid);
    });
}

function buildTrickChip(trick, onPick, isBaseMark) {
    const chip = el('button', {
        className: `game-trick-chip${isBaseMark ? ' is-base' : ''}`,
        type: 'button',
        dataset: { trickId: trick.id },
        onClick: () => onPick && onPick(trick)
    });
    chip.appendChild(el('span', { className: 'game-trick-chip-name' }, trick.name));
    const meta = el('span', { className: 'game-trick-chip-meta' });
    meta.appendChild(el('span', { className: 'game-trick-chip-diff' }, 'D'.repeat(trick.difficulty || 1)));
    if (isBaseMark) meta.appendChild(el('span', { className: 'game-trick-chip-star' }, '★'));
    chip.appendChild(meta);
    return chip;
}

/* Picker de variação (stance + side) — modal compacto */
/** Determina quais modifiers fazem sentido pra uma trick. */
function availableModifiersFor(trick) {
    const mods = [];
    const cat = trick.category;
    const id = trick.id;
    // late-shove e late-flip: só pra flatground com pop (exclui manual)
    const popFlat = cat === 'flatground' && id !== 'manual';
    if (popFlat) {
        mods.push({ id: 'late-shove', label: 'LATE SHOVE-IT' });
        mods.push({ id: 'late-flip',  label: 'LATE FLIP' });
    }
    // body varial (sex change): qualquer flatground exceto manual
    if (cat === 'flatground' && id !== 'manual') {
        mods.push({ id: 'body-varial', label: 'BODY VARIAL' });
    }
    // ollie north / south: só ollie e variantes pop sem rotação
    if (id === 'ollie' || id === 'kickflip' || id === 'heelflip') {
        mods.push({ id: 'ollie-north', label: 'OLLIE NORTH' });
        mods.push({ id: 'ollie-south', label: 'OLLIE SOUTH' });
    }
    // grab: qualquer flatground com pop (incluindo ollie, flips, shoves)
    if (popFlat) {
        mods.push({ id: 'grab-indy',     label: 'INDY GRAB' });
        mods.push({ id: 'grab-melon',    label: 'MELON GRAB' });
        mods.push({ id: 'grab-mute',     label: 'MUTE GRAB' });
        mods.push({ id: 'grab-stalefish','label': 'STALEFISH' });
    }
    return mods;
}

function openVariationPicker(state, trick) {
    const overlay = el('div', {
        className: 'game-overlay game-variation-overlay',
        onClick: (e) => { if (e.target === overlay) overlay.remove(); }
    });
    const card = el('div', { className: 'game-overlay-card game-variation-card' });
    card.appendChild(el('h3', { className: 'game-variation-title' }, trick.name));
    card.appendChild(el('p', { className: 'game-variation-sub' }, 'escolhe a variação'));

    const stanceRow = el('div', { className: 'game-variation-row' });
    ['regular', 'switch', 'fakie', 'nollie'].forEach(s => {
        stanceRow.appendChild(el('button', {
            className: 'game-variation-btn',
            type: 'button',
            dataset: { stance: s },
            onClick: () => { state._pickStance = s; markActive(stanceRow, s, 'stance'); maybeConfirm(); }
        }, stanceLabel(s).toUpperCase()));
    });
    card.appendChild(stanceRow);

    let sideRow = null;
    if (trick.hasSides) {
        sideRow = el('div', { className: 'game-variation-row' });
        ['fs', 'bs'].forEach(s => {
            sideRow.appendChild(el('button', {
                className: 'game-variation-btn',
                type: 'button',
                dataset: { side: s },
                onClick: () => { state._pickSide = s; markActive(sideRow, s, 'side'); maybeConfirm(); }
            }, s.toUpperCase()));
        });
        card.appendChild(sideRow);
    }

    // Modifiers (escondido até clicar "ADICIONAR VARIAÇÃO")
    const availMods = availableModifiersFor(trick);
    state._pickModifiers = state._pickModifiers || [];
    state._pickModifiers = []; // reset ao abrir
    let modSection = null;
    if (availMods.length > 0) {
        modSection = el('div', { className: 'game-modifier-section', hidden: '' });
        modSection.appendChild(el('p', { className: 'game-modifier-label' }, 'VARIAÇÕES (toggle)'));
        const modRow = el('div', { className: 'game-variation-row game-modifier-row' });
        availMods.forEach(m => {
            modRow.appendChild(el('button', {
                className: 'game-variation-btn game-modifier-btn',
                type: 'button',
                dataset: { mod: m.id },
                onClick: (e) => {
                    const btn = e.currentTarget;
                    const idx = state._pickModifiers.indexOf(m.id);
                    if (idx === -1) {
                        state._pickModifiers.push(m.id);
                        btn.classList.add('is-active');
                    } else {
                        state._pickModifiers.splice(idx, 1);
                        btn.classList.remove('is-active');
                    }
                    maybeConfirm();
                }
            }, m.label));
        });
        modSection.appendChild(modRow);
        card.appendChild(modSection);
    }

    // aviso de combo já usado
    const warning = el('p', { className: 'game-variation-warn', hidden: '' }, 'essa variação já foi puxada nessa partida');
    card.appendChild(warning);

    // Botões: cancelar | adicionar variação | confirmar (em uma linha)
    const btnRow = el('div', { className: 'game-variation-btnrow' });

    btnRow.appendChild(el('button', {
        className: 'game-secondary-btn game-variation-cancel',
        type: 'button',
        onClick: () => overlay.remove()
    }, 'CANCELAR'));

    let addModBtn = null;
    if (availMods.length > 0) {
        addModBtn = el('button', {
            className: 'game-secondary-btn game-variation-addmod',
            type: 'button',
            onClick: () => {
                if (modSection.hasAttribute('hidden')) {
                    modSection.removeAttribute('hidden');
                    addModBtn.textContent = 'OCULTAR VARIAÇÕES';
                } else {
                    modSection.setAttribute('hidden', '');
                    addModBtn.textContent = '+ VARIAÇÃO';
                    // limpa modifiers ao ocultar
                    state._pickModifiers = [];
                    modSection.querySelectorAll('.game-modifier-btn').forEach(b => b.classList.remove('is-active'));
                    maybeConfirm();
                }
            }
        }, '+ VARIAÇÃO');
        btnRow.appendChild(addModBtn);
    }

    const confirmBtn = el('button', {
        className: 'game-primary-btn game-variation-confirm',
        type: 'button',
        disabled: '',
        onClick: () => {
            const stance = state._pickStance;
            const side = trick.hasSides ? state._pickSide : undefined;
            const modifiers = (state._pickModifiers || []).slice();
            state.match.currentTrick = { trick, stance, side, modifiers };
            state.match.subphase = 'set-attempt';
            state._pickStance = null;
            state._pickSide = null;
            state._pickModifiers = [];
            overlay.remove();
            renderSubphase(state);
        }
    }, 'CONFIRMAR');
    btnRow.appendChild(confirmBtn);

    card.appendChild(btnRow);

    function markActive(row, val, kind) {
        row.querySelectorAll('.game-variation-btn').forEach(b => {
            b.classList.toggle('is-active', b.dataset[kind] === val);
        });
    }
    function maybeConfirm() {
        const okStance = !!state._pickStance;
        const okSide = !trick.hasSides || !!state._pickSide;
        if (!okStance || !okSide) {
            confirmBtn.setAttribute('disabled', '');
            warning.setAttribute('hidden', '');
            return;
        }
        const combo = {
            trick,
            stance: state._pickStance,
            side: trick.hasSides ? state._pickSide : undefined,
            modifiers: state._pickModifiers || []
        };
        const key = comboKey(combo);
        const isUsed = state.match.usedCombos.has(key);
        const hasAvailable = hasAnyAvailableCombo(state);
        if (isUsed && hasAvailable) {
            confirmBtn.setAttribute('disabled', '');
            warning.removeAttribute('hidden');
        } else {
            confirmBtn.removeAttribute('disabled');
            warning.setAttribute('hidden', '');
        }
    }

    overlay.appendChild(card);
    document.body.appendChild(overlay);
}

/* =========================================================
   HELPERS
   ========================================================= */

function formatTrickLabel({ trick, stance, side, modifiers }) {
    const parts = [];
    if (stance && stance !== 'regular') parts.push(stanceLabel(stance).toUpperCase());
    if (side) parts.push(side.toUpperCase());
    parts.push(trick.name);
    if (modifiers && modifiers.length > 0) {
        const modLabels = modifiers.map(m => {
            switch (m) {
                case 'late-shove':     return '+ LATE SHOVE';
                case 'late-flip':      return '+ LATE FLIP';
                case 'body-varial':    return '+ BODY VARIAL';
                case 'ollie-north':    return '+ OLLIE NORTH';
                case 'ollie-south':    return '+ OLLIE SOUTH';
                case 'grab-indy':      return '+ INDY';
                case 'grab-melon':     return '+ MELON';
                case 'grab-mute':      return '+ MUTE';
                case 'grab-stalefish': return '+ STALEFISH';
                default:               return '+ ' + m.toUpperCase();
            }
        });
        parts.push(modLabels.join(' '));
    }
    return parts.join(' ');
}

function animateAttempt(stampEl, onDone) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setTimeout(onDone, 300); return; }
    stampEl.classList.add('is-shaking');
    setTimeout(() => {
        stampEl.classList.remove('is-shaking');
        onDone();
    }, 900);
}

function flashStamp(kind) {
    const central = document.getElementById('game-central');
    if (!central) return;
    const stamp = central.querySelector('.game-trick-stamp');
    if (!stamp) return;
    stamp.classList.add(kind === 'hit' ? 'is-hit' : 'is-miss');
    if (kind === 'hit') sfx.clickPositive();
    else sfx.stampMiss();
    setTimeout(() => stamp.classList.remove('is-hit', 'is-miss'), 600);
}

function flashToast(text) {
    const t = el('div', { className: 'toast' }, text);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
}

export default { render };
