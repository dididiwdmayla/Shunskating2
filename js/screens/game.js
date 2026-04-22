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
 *   - Setter escolhe manobra; se acerta, responder tem que fazer igual.
 *   - Se responder erra, pega letra (S → K → A → T → E).
 *   - Se setter erra, passa a vez; responder vira setter.
 *   - Setter tem no máx 3 tentativas por turno; se estourar, passa a vez.
 *   - Primeiro a completar SKATE perde.
 */

import { el, fetchJson, escapeHtml, stanceLabel } from '../utils.js';
import {
    getBases, toggleBase, isBase,
    getMatchHistory, saveMatch,
    getBotStats, grantMedal, hasMedal, getMedals,
    getSettings
} from '../storage.js';

const LETTERS = ['S', 'K', 'A', 'T', 'E'];
const MAX_SETTER_ATTEMPTS = 3;

let tricksData = null;
let botsData = null;

async function loadData() {
    if (!tricksData) tricksData = await fetchJson('data/tricks.json');
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

    // Seção: Escolher oponente
    screen.appendChild(el('h2', { className: 'game-section-title' }, 'ESCOLHE O OPONENTE'));
    const botGrid = el('div', { className: 'game-bot-grid' });
    data.bots.bots.forEach(bot => {
        botGrid.appendChild(renderBotCard(bot, state));
    });
    screen.appendChild(botGrid);

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

function renderBotCard(bot, state) {
    const stats = getBotStats(bot.id);
    const medal = hasMedal(bot.id);
    const card = el('button', {
        className: `game-bot-card game-bot-${bot.id}${medal ? ' has-medal' : ''}`,
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
    state.match = {
        bot,
        playerLetters: [],
        botLetters: [],
        // 'player' ou 'bot': quem é setter atual
        setter: Math.random() < 0.5 ? 'player' : 'bot',
        // subfase: 'set-pick' | 'set-attempt' | 'resp-attempt' | 'between'
        subphase: 'coin',
        currentTrick: null, // { trick, stance, side }
        setterAttempts: 0,
        log: [],
        startedAt: new Date().toISOString()
    };
    renderMatch(state);
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
    pSide.appendChild(renderLetters(m.playerLetters));
    board.appendChild(pSide);

    // VS
    board.appendChild(el('div', { className: 'game-vs' }, 'VS'));

    // Bot
    const bSide = el('div', { className: 'game-side game-side-bot' });
    bSide.appendChild(el('div', { className: 'game-side-label' }, m.bot.name.toUpperCase()));
    bSide.appendChild(renderLetters(m.botLetters));
    board.appendChild(bSide);

    return board;
}

function renderLetters(collected) {
    const box = el('div', { className: 'game-letters' });
    LETTERS.forEach((L, i) => {
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
        case 'coin':        return renderCoin(state, central);
        case 'set-pick':    return renderSetPick(state, central);
        case 'set-attempt': return renderSetAttempt(state, central);
        case 'resp-attempt':return renderRespAttempt(state, central);
        case 'between':     return renderBetween(state, central);
    }
}

/* ---- Subfase: coin (quem começa) ---- */

function renderCoin(state, central) {
    central.appendChild(el('p', { className: 'game-phase-label' }, 'QUEM COMEÇA?'));
    const starterLabel = state.match.setter === 'player' ? 'VOCÊ COMEÇA' : `${state.match.bot.name.toUpperCase()} COMEÇA`;
    central.appendChild(el('div', { className: 'game-coin-result' }, starterLabel));
    central.appendChild(el('button', {
        className: 'game-primary-btn',
        type: 'button',
        onClick: () => {
            state.match.subphase = 'set-pick';
            renderSubphase(state);
        }
    }, 'BORA'));
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
            onPick: (trick) => openVariationPicker(state, trick)
        });
        central.appendChild(picker);
    } else {
        // bot escolhe
        central.appendChild(el('p', { className: 'game-phase-label' }, `${m.bot.name.toUpperCase()} ESTÁ ESCOLHENDO...`));
        central.appendChild(el('div', { className: 'game-thinking' }, '. . .'));
        setTimeout(() => {
            const pick = botPickTrick(m.bot, state.data.tricks);
            m.currentTrick = pick;
            m.setterAttempts = 0;
            m.subphase = 'set-attempt';
            renderSubphase(state);
        }, 900);
    }
}

/* ---- Subfase: setter tenta ---- */

function renderSetAttempt(state, central) {
    const m = state.match;
    const trickLabel = formatTrickLabel(m.currentTrick);
    const attemptNum = m.setterAttempts + 1;

    central.appendChild(el('p', { className: 'game-phase-label' },
        m.setter === 'player' ? `VOCÊ VAI TENTAR (${attemptNum}/${MAX_SETTER_ATTEMPTS})` : `${m.bot.name.toUpperCase()} VAI TENTAR (${attemptNum}/${MAX_SETTER_ATTEMPTS})`
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
            const success = rollBotAccuracy(m.bot, m.currentTrick.trick);
            setterResult(state, success);
        });
    }
}

function setterResult(state, success) {
    const m = state.match;
    const who = m.setter === 'player' ? 'você' : m.bot.name;
    const trickLabel = formatTrickLabel(m.currentTrick);

    if (success) {
        addLog(state, 'hit', `${who} acertou ${trickLabel}`);
        flashStamp('hit');
        // passa pro responder
        m.subphase = 'resp-attempt';
        setTimeout(() => renderSubphase(state), 700);
    } else {
        m.setterAttempts++;
        addLog(state, 'miss-setter', `${who} errou ${trickLabel}`);
        flashStamp('miss');
        if (m.setterAttempts >= MAX_SETTER_ATTEMPTS) {
            addLog(state, 'neutral', `passou a vez`);
            // alterna setter, sem letra
            m.setter = m.setter === 'player' ? 'bot' : 'player';
            m.currentTrick = null;
            m.setterAttempts = 0;
            m.subphase = 'set-pick';
            setTimeout(() => renderSubphase(state), 700);
        } else {
            // renderiza de novo (mesma subfase, mais uma tentativa)
            setTimeout(() => renderSubphase(state), 700);
        }
    }
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
            const success = rollBotAccuracy(m.bot, m.currentTrick.trick);
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
        // troca setter (responder vira setter na próxima, regra padrão)
        m.setter = responder;
    } else {
        // dá letra ao responder
        const letters = responder === 'player' ? m.playerLetters : m.botLetters;
        const newLetter = LETTERS[letters.length];
        letters.push(newLetter);
        addLog(state, 'miss-resp', `${who} errou · +${newLetter}`);
        flashStamp('miss');
        // re-render scoreboard com nova letra
        setTimeout(() => updateScoreboardLetters(state), 100);

        // checa fim de jogo
        if (letters.length >= LETTERS.length) {
            setTimeout(() => {
                // quem completou SKATE perde
                finishMatch(state, responder === 'player' ? 'loss' : 'win', false);
            }, 900);
            return;
        }
        // setter mantém (regra real: quem setou continua setando)
        // nota: aqui optamos pelo padrão: setter mantém após forçar letra
    }
    m.currentTrick = null;
    m.setterAttempts = 0;
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
        startedAt: m.startedAt,
        endedAt: new Date().toISOString(),
        log: m.log.slice()
    };
    saveMatch(match);
    const firstMedal = result === 'win' ? grantMedal(m.bot.id) : false;
    state.phase = 'result';
    state.resultData = { match, firstMedal };
    renderResult(state);
}

function renderResult(state) {
    const { container } = state;
    container.innerHTML = '';
    const { match, firstMedal } = state.resultData;
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

    // Placar final
    const finalBoard = el('div', { className: 'game-result-board' });
    finalBoard.appendChild(el('div', { className: 'game-result-side' },
        el('div', { className: 'game-result-side-label' }, 'VOCÊ'),
        renderLetters(match.playerLetters)
    ));
    finalBoard.appendChild(el('div', { className: 'game-result-side' },
        el('div', { className: 'game-result-side-label' }, bot.name.toUpperCase()),
        renderLetters(match.botLetters)
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

/** Rola se o bot acerta baseado em accuracy efetiva (ajustada por difficulty). */
function rollBotAccuracy(bot, trick) {
    const diff = trick.difficulty || 2;
    let acc = bot.accuracy - (diff - 2) * 0.08;
    if (acc < 0.15) acc = 0.15;
    if (acc > 0.95) acc = 0.95;
    return Math.random() < acc;
}

/** Bot escolhe manobra do pool dele, enviesado pra trick com acc efetiva >= 0.5.
 *  Retorna { trick, stance, side? }. */
function botPickTrick(bot, tricksData) {
    const pool = bot.pool
        .map(id => tricksData.tricks.find(t => t.id === id))
        .filter(Boolean);
    if (pool.length === 0) {
        // fallback: qualquer trick
        const t = tricksData.tricks[Math.floor(Math.random() * tricksData.tricks.length)];
        return { trick: t, stance: 'regular', side: t.hasSides ? 'fs' : undefined };
    }
    // enviesa pra tricks com acc efetiva >= 0.5: peso 3x; as outras peso 1x
    const weighted = [];
    pool.forEach(t => {
        const diff = t.difficulty || 2;
        const acc = bot.accuracy - (diff - 2) * 0.08;
        const weight = acc >= 0.5 ? 3 : 1;
        for (let i = 0; i < weight; i++) weighted.push(t);
    });
    const trick = weighted[Math.floor(Math.random() * weighted.length)];
    const stance = weightedPick(bot.stanceBias || { regular: 1 });
    const side = trick.hasSides ? (Math.random() < 0.5 ? 'fs' : 'bs') : undefined;
    return { trick, stance, side };
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
    const { filterBases, highlightBases, onPick } = opts;
    const bases = getBases();

    // Primeiro: grupo Bases (se highlightBases e tem pelo menos 1)
    if (highlightBases && bases.length > 0) {
        const baseTricks = bases
            .map(id => tricksData.tricks.find(t => t.id === id))
            .filter(Boolean);
        if (baseTricks.length > 0) {
            container.appendChild(el('div', { className: 'game-picker-cat-label game-picker-cat-bases' }, '★ BASES'));
            const grid = el('div', { className: 'game-picker-grid' });
            baseTricks.forEach(t => grid.appendChild(buildTrickChip(t, onPick, true)));
            container.appendChild(grid);
        }
    }

    // Agora: por categoria
    const byCategory = {};
    tricksData.tricks.forEach(t => {
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

    const confirmBtn = el('button', {
        className: 'game-primary-btn',
        type: 'button',
        disabled: '',
        onClick: () => {
            const stance = state._pickStance;
            const side = trick.hasSides ? state._pickSide : undefined;
            state.match.currentTrick = { trick, stance, side };
            state.match.setterAttempts = 0;
            state.match.subphase = 'set-attempt';
            state._pickStance = null;
            state._pickSide = null;
            overlay.remove();
            renderSubphase(state);
        }
    }, 'CONFIRMAR');
    card.appendChild(confirmBtn);

    card.appendChild(el('button', {
        className: 'game-secondary-btn',
        type: 'button',
        onClick: () => overlay.remove()
    }, 'CANCELAR'));

    function markActive(row, val, kind) {
        row.querySelectorAll('.game-variation-btn').forEach(b => {
            b.classList.toggle('is-active', b.dataset[kind] === val);
        });
    }
    function maybeConfirm() {
        const okStance = !!state._pickStance;
        const okSide = !trick.hasSides || !!state._pickSide;
        if (okStance && okSide) confirmBtn.removeAttribute('disabled');
        else confirmBtn.setAttribute('disabled', '');
    }

    overlay.appendChild(card);
    document.body.appendChild(overlay);
}

/* =========================================================
   HELPERS
   ========================================================= */

function formatTrickLabel({ trick, stance, side }) {
    const parts = [];
    if (stance && stance !== 'regular') parts.push(stanceLabel(stance).toUpperCase());
    if (side) parts.push(side.toUpperCase());
    parts.push(trick.name);
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
    setTimeout(() => stamp.classList.remove('is-hit', 'is-miss'), 600);
}

function flashToast(text) {
    const t = el('div', { className: 'toast' }, text);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
}

export default { render };
