/**
 * storage.js
 * Wrapper seguro para localStorage com namespace versionado.
 * Toda leitura/escrita passa por aqui — nunca chamar localStorage direto.
 */

export const STORAGE_VERSION = 'shun_v2';

export const STORAGE_KEYS = {
    progress:   `${STORAGE_VERSION}.progress`,   // { [trickId]: { regular: 0-5, switch, fakie, nollie } }
    notes:      `${STORAGE_VERSION}.notes`,      // { [trickId]: { regular: "text", switch, fakie, nollie } }
    favorites:  `${STORAGE_VERSION}.favorites`,  // [trickId, ...]
    highlights: `${STORAGE_VERSION}.highlights`, // { [`${trickId}|${stance}`]: [{ start, end, color, text }] }
    settings:   `${STORAGE_VERSION}.settings`,    // { audioEnabled, reducedMotion, ... }
    bombUseful: `${STORAGE_VERSION}.bombUseful`, // { [trickId]: [ideaText, ...] }
    links:      `${STORAGE_VERSION}.links`,      // { [`${trickId}|${stance}[|${side}]`]: [{ url, title, addedAt }] }
    goals:      `${STORAGE_VERSION}.goals`,      // [ { id, type, createdAt, expiresAt, trickIds, completed, note } ]
    bases:      `${STORAGE_VERSION}.bases`,      // [trickId, ...] — manobras estratégicas pro Game
    matches:    `${STORAGE_VERSION}.matches`,    // [ { id, botId, result, playerLetters, botLetters, startedAt, endedAt, log } ]
    medals:     `${STORAGE_VERSION}.medals`,     // [botId, ...] — bots que o jogador venceu pelo menos uma vez
    myIdentity: `${STORAGE_VERSION}.myIdentity`, // { nick, id, created, stance, city, favTrick, favPro }
    crew:       `${STORAGE_VERSION}.crew`,       // [ { id, nick, stance, city, favTrick, favPro, stampedAt } ]
    crews:      `${STORAGE_VERSION}.crews`,      // [ { id, name, memberIds: [...], createdAt } ]
    userLines:  `${STORAGE_VERSION}.userLines`,  // [ { id, name, trickIds, createdAt, completedAt|null } ]
    suggestedLine: `${STORAGE_VERSION}.suggestedLine`, // { date, trickIds, regenCount, completedAt|null }
    dailySugg:  `${STORAGE_VERSION}.dailySugg`,  // { date, trickIds, attempts: { [trickId]: lastAttemptDate } }
    onboardingSkatistasDone: `${STORAGE_VERSION}.onboardingSkatistasDone`,
    swipeHintShown:          `${STORAGE_VERSION}.swipeHintShown`,
    unlockedBots:            `${STORAGE_VERSION}.unlockedBots`     // [botId, ...] — bots especiais desbloqueados
};

const MATCHES_CAP = 50;
const BASES_CAP = 10;

/**
 * Lê e parseia chave do storage.
 * Retorna fallback se chave não existe, JSON inválido, ou erro.
 */
export function get(key, fallback = null) {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        return JSON.parse(raw);
    } catch (err) {
        console.warn('[storage] falha ao ler', key, err);
        return fallback;
    }
}

/**
 * Serializa e grava chave no storage.
 * Retorna true em sucesso, false em erro (ex: quota).
 */
export function set(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (err) {
        console.warn('[storage] falha ao gravar', key, err);
        return false;
    }
}

/**
 * Remove chave do storage.
 */
export function remove(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (err) {
        console.warn('[storage] falha ao remover', key, err);
        return false;
    }
}

/**
 * Exporta todas as chaves do namespace em objeto único (para backup).
 */
export function exportAll() {
    const data = {};
    for (const [name, key] of Object.entries(STORAGE_KEYS)) {
        data[name] = get(key);
    }
    return {
        version: STORAGE_VERSION,
        exportedAt: new Date().toISOString(),
        data
    };
}

/**
 * Importa backup validando schema básico.
 * Retorna true se aplicou, false se inválido.
 */
export function importAll(backup) {
    if (!backup || backup.version !== STORAGE_VERSION || !backup.data) return false;
    for (const [name, key] of Object.entries(STORAGE_KEYS)) {
        if (backup.data[name] !== undefined) {
            set(key, backup.data[name]);
        }
    }
    return true;
}

/* ---------- helpers de alto nível ----------
 *
 * Nota sobre `side`: manobras de slide/grind que têm FS e BS usam
 * chaves `${stance}|${side}` (ex: regular|fs, regular|bs). Para
 * manobras sem sides (flatground, manuals), side vem undefined e
 * a chave volta a ser só o stance. Isso mantém compatibilidade
 * com dados antigos.
 */

function stanceKey(stance, side) {
    return side ? `${stance}|${side}` : stance;
}

/** Progresso: lê nível de (trickId, stance, side?). */
export function getProgress(trickId, stance, side) {
    const all = get(STORAGE_KEYS.progress, {});
    const k = stanceKey(stance, side);
    return (all[trickId] && all[trickId][k]) || 0;
}

/** Progresso: grava nível. */
export function setProgress(trickId, stance, level, side) {
    // Compatibilidade: chamadas antigas vinham como (trickId, stance, level)
    // novas podem vir como (trickId, stance, level, side).
    const all = get(STORAGE_KEYS.progress, {});
    if (!all[trickId]) all[trickId] = {};
    all[trickId][stanceKey(stance, side)] = level;
    set(STORAGE_KEYS.progress, all);
}

/** Progresso: média pra cards do catálogo (considera todas as variações salvas). */
export function getProgressAverage(trickId) {
    const all = get(STORAGE_KEYS.progress, {});
    const t = all[trickId];
    if (!t) return 0;
    const values = Object.values(t).filter(v => typeof v === 'number');
    if (values.length === 0) return 0;
    const sum = values.reduce((a, b) => a + b, 0);
    return Math.round(sum / values.length);
}

/** Notas: lê nota de (trickId, stance, side?). */
export function getNote(trickId, stance, side) {
    const all = get(STORAGE_KEYS.notes, {});
    const k = stanceKey(stance, side);
    return (all[trickId] && all[trickId][k]) || '';
}

/** Notas: grava nota (texto vazio remove). */
export function setNote(trickId, stance, text, side) {
    const all = get(STORAGE_KEYS.notes, {});
    const k = stanceKey(stance, side);
    if (!all[trickId]) all[trickId] = {};
    if (!text) {
        delete all[trickId][k];
        if (Object.keys(all[trickId]).length === 0) delete all[trickId];
    } else {
        all[trickId][k] = text;
    }
    set(STORAGE_KEYS.notes, all);
}

/** Favoritos: lista de ids. */
export function getFavorites() {
    return get(STORAGE_KEYS.favorites, []);
}

/** Favoritos: alterna (add se não tem, remove se tem). Retorna novo estado. */
export function toggleFavorite(trickId) {
    const favs = getFavorites();
    const idx = favs.indexOf(trickId);
    if (idx === -1) {
        favs.push(trickId);
    } else {
        favs.splice(idx, 1);
    }
    set(STORAGE_KEYS.favorites, favs);
    return favs.includes(trickId);
}

/** Highlights: lê highlights de (trickId, stance, side?). */
export function getHighlights(trickId, stance, side) {
    const all = get(STORAGE_KEYS.highlights, {});
    const full = side ? `${trickId}|${stance}|${side}` : `${trickId}|${stance}`;
    return all[full] || [];
}

/** Highlights: grava lista. */
export function setHighlights(trickId, stance, list, side) {
    const all = get(STORAGE_KEYS.highlights, {});
    const full = side ? `${trickId}|${stance}|${side}` : `${trickId}|${stance}`;
    if (!list || list.length === 0) {
        delete all[full];
    } else {
        all[full] = list;
    }
    set(STORAGE_KEYS.highlights, all);
}

/** Settings: getter/setter helpers. */
export function getSettings() {
    return get(STORAGE_KEYS.settings, {
        audioEnabled:  true,
        reducedMotion: false
    });
}

export function setSetting(name, value) {
    const s = getSettings();
    s[name] = value;
    set(STORAGE_KEYS.settings, s);
}

/* ---------- Bomba de Ideias: ideias marcadas como úteis ---------- */

/** Retorna lista de textos de ideias úteis salvos para um trickId. */
export function getBombUseful(trickId) {
    const all = get(STORAGE_KEYS.bombUseful, {});
    return all[trickId] || [];
}

/** Alterna uma ideia (adiciona se não tem, remove se tem). Retorna true se ficou marcada. */
export function toggleBombUseful(trickId, ideaText) {
    const all = get(STORAGE_KEYS.bombUseful, {});
    const list = all[trickId] || [];
    const idx = list.indexOf(ideaText);
    if (idx === -1) {
        list.push(ideaText);
    } else {
        list.splice(idx, 1);
    }
    if (list.length === 0) {
        delete all[trickId];
    } else {
        all[trickId] = list;
    }
    set(STORAGE_KEYS.bombUseful, all);
    return list.includes(ideaText);
}

/* ---------- Links por manobra/stance/side ---------- */

function linkKey(trickId, stance, side) {
    return side ? `${trickId}|${stance}|${side}` : `${trickId}|${stance}`;
}

/** Retorna array de links para (trickId, stance, side?). */
export function getLinks(trickId, stance, side) {
    const all = get(STORAGE_KEYS.links, {});
    return all[linkKey(trickId, stance, side)] || [];
}

/** Adiciona um link. Retorna a lista atualizada. */
export function addLink(trickId, stance, url, title = '', side) {
    const all = get(STORAGE_KEYS.links, {});
    const k = linkKey(trickId, stance, side);
    if (!all[k]) all[k] = [];
    all[k].push({
        id: 'lnk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        url,
        title: title || url,
        addedAt: new Date().toISOString()
    });
    set(STORAGE_KEYS.links, all);
    return all[k];
}

/** Remove link por id. Retorna a nova lista. */
export function removeLink(trickId, stance, linkId, side) {
    const all = get(STORAGE_KEYS.links, {});
    const k = linkKey(trickId, stance, side);
    if (!all[k]) return [];
    all[k] = all[k].filter(l => l.id !== linkId);
    if (all[k].length === 0) delete all[k];
    set(STORAGE_KEYS.links, all);
    return all[k] || [];
}

/* ---------- Metas (diária/semanal/mensal) ---------- */

/**
 * Calcula timestamp de expiração baseado no tipo.
 * - diária: fim do dia atual
 * - semanal: fim de domingo da semana atual
 * - mensal: último dia do mês atual
 */
function computeExpiresAt(type, now = new Date()) {
    const d = new Date(now);
    if (type === 'daily') {
        d.setHours(23, 59, 59, 999);
    } else if (type === 'weekly') {
        // fim de domingo (dia 0 em JS; domingo da semana corrente)
        const day = d.getDay(); // 0=dom,1=seg,...,6=sab
        const daysUntilSunday = day === 0 ? 0 : 7 - day;
        d.setDate(d.getDate() + daysUntilSunday);
        d.setHours(23, 59, 59, 999);
    } else if (type === 'monthly') {
        // último dia do mês corrente
        d.setMonth(d.getMonth() + 1, 0);
        d.setHours(23, 59, 59, 999);
    }
    return d.toISOString();
}

/** Retorna todas as metas (ativas + histórico). */
export function getGoals() {
    return get(STORAGE_KEYS.goals, []);
}

/** Retorna apenas metas ativas (não expiradas). */
export function getActiveGoals() {
    const now = Date.now();
    return getGoals().filter(g => new Date(g.expiresAt).getTime() >= now);
}

/** Retorna metas expiradas há no máximo N dias (histórico recente). */
export function getRecentGoals(maxDaysAfterExpiry = 7) {
    const now = Date.now();
    const cutoff = now - maxDaysAfterExpiry * 24 * 60 * 60 * 1000;
    return getGoals().filter(g => {
        const exp = new Date(g.expiresAt).getTime();
        return exp < now && exp >= cutoff;
    });
}

/** Cria nova meta. Retorna a meta criada. */
export function addGoal(type, trickIds, note = '') {
    if (!['daily', 'weekly', 'monthly'].includes(type)) {
        throw new Error('Tipo de meta inválido: ' + type);
    }
    const now = new Date();
    const goal = {
        id: 'goal_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        type,
        createdAt: now.toISOString(),
        expiresAt: computeExpiresAt(type, now),
        trickIds: trickIds.slice(),
        completed: [],
        note: note || ''
    };
    const all = getGoals();
    all.push(goal);
    set(STORAGE_KEYS.goals, all);
    return goal;
}

/** Atualiza completed: marca/desmarca trickId em uma meta. */
export function toggleGoalTrickCompletion(goalId, trickId) {
    const all = getGoals();
    const g = all.find(x => x.id === goalId);
    if (!g) return null;
    const idx = g.completed.indexOf(trickId);
    if (idx === -1) g.completed.push(trickId);
    else g.completed.splice(idx, 1);
    set(STORAGE_KEYS.goals, all);
    return g;
}

/** Deleta meta. */
export function deleteGoal(goalId) {
    const all = getGoals().filter(g => g.id !== goalId);
    set(STORAGE_KEYS.goals, all);
}

/** Limpa metas expiradas há mais de N dias (manutenção). */
export function purgeOldGoals(maxDaysAfterExpiry = 14) {
    const now = Date.now();
    const cutoff = now - maxDaysAfterExpiry * 24 * 60 * 60 * 1000;
    const all = getGoals().filter(g => {
        const exp = new Date(g.expiresAt).getTime();
        return exp >= cutoff; // mantém ativas + as expiradas recentes
    });
    set(STORAGE_KEYS.goals, all);
}

/* ---------- Bases (favoritas estratégicas pro Game) ---------- */

export function getBases() {
    return get(STORAGE_KEYS.bases, []);
}

/** Alterna uma base. Respeita cap. Retorna { list, changed, atCap }. */
export function toggleBase(trickId) {
    const bases = getBases();
    const idx = bases.indexOf(trickId);
    if (idx !== -1) {
        bases.splice(idx, 1);
        set(STORAGE_KEYS.bases, bases);
        return { list: bases, changed: true, atCap: false };
    }
    if (bases.length >= BASES_CAP) {
        return { list: bases, changed: false, atCap: true };
    }
    bases.push(trickId);
    set(STORAGE_KEYS.bases, bases);
    return { list: bases, changed: true, atCap: false };
}

export function isBase(trickId) {
    return getBases().includes(trickId);
}

/* ---------- Histórico de partidas ---------- */

export function getMatchHistory() {
    return get(STORAGE_KEYS.matches, []);
}

/** Salva uma partida; mantém só as últimas MATCHES_CAP (FIFO). */
export function saveMatch(match) {
    const all = getMatchHistory();
    all.unshift(match);
    if (all.length > MATCHES_CAP) all.length = MATCHES_CAP;
    set(STORAGE_KEYS.matches, all);
}

/** Estatísticas contra um bot específico: { wins, losses }. */
export function getBotStats(botId) {
    const all = getMatchHistory().filter(m => m.botId === botId);
    let wins = 0, losses = 0;
    for (const m of all) {
        if (m.result === 'win') wins++;
        else if (m.result === 'loss') losses++;
    }
    return { wins, losses };
}

/* ---------- Medalhas ---------- */

export function getMedals() {
    return get(STORAGE_KEYS.medals, []);
}

/** Adiciona medalha de vitória contra bot (idempotente). Retorna true se é primeira. */
export function grantMedal(botId) {
    const medals = getMedals();
    if (medals.includes(botId)) return false;
    medals.push(botId);
    set(STORAGE_KEYS.medals, medals);
    return true;
}

export function hasMedal(botId) {
    return getMedals().includes(botId);
}

/* ---------- Skatistas ---------- */

export function getMyIdentity() {
    return get(STORAGE_KEYS.myIdentity, null);
}

export function setMyIdentity(identity) {
    set(STORAGE_KEYS.myIdentity, identity);
}

export function getCrew() {
    return get(STORAGE_KEYS.crew, []);
}

export function addToCrew(skatista) {
    const crew = getCrew();
    // bloqueia duplicata pelo id único
    if (crew.some(s => s.id === skatista.id)) return false;
    crew.push({ ...skatista, stampedAt: new Date().toISOString() });
    set(STORAGE_KEYS.crew, crew);
    return true;
}

export function removeFromCrew(skatistaId) {
    const crew = getCrew().filter(s => s.id !== skatistaId);
    set(STORAGE_KEYS.crew, crew);
    // remove também dos grupos
    const crews = getCrews().map(c => ({
        ...c,
        memberIds: c.memberIds.filter(id => id !== skatistaId)
    }));
    set(STORAGE_KEYS.crews, crews);
}

export function getCrews() {
    return get(STORAGE_KEYS.crews, []);
}

export function createCrew(name) {
    const crews = getCrews();
    const newCrew = {
        id: 'crew_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        name: String(name).slice(0, 40),
        memberIds: [],
        createdAt: new Date().toISOString()
    };
    crews.push(newCrew);
    set(STORAGE_KEYS.crews, crews);
    return newCrew;
}

export function updateCrew(crewId, patch) {
    const crews = getCrews();
    const idx = crews.findIndex(c => c.id === crewId);
    if (idx === -1) return null;
    crews[idx] = { ...crews[idx], ...patch };
    set(STORAGE_KEYS.crews, crews);
    return crews[idx];
}

export function deleteCrew(crewId) {
    const crews = getCrews().filter(c => c.id !== crewId);
    set(STORAGE_KEYS.crews, crews);
}

export function toggleCrewMember(crewId, skatistaId) {
    const crews = getCrews();
    const idx = crews.findIndex(c => c.id === crewId);
    if (idx === -1) return null;
    const memberIds = crews[idx].memberIds.slice();
    const pos = memberIds.indexOf(skatistaId);
    if (pos === -1) memberIds.push(skatistaId);
    else memberIds.splice(pos, 1);
    crews[idx].memberIds = memberIds;
    set(STORAGE_KEYS.crews, crews);
    return crews[idx];
}

export function isOnboardingSkatistasDone() {
    return get(STORAGE_KEYS.onboardingSkatistasDone, false) === true;
}

export function markOnboardingSkatistasDone() {
    set(STORAGE_KEYS.onboardingSkatistasDone, true);
}

export function isSwipeHintShown() {
    return get(STORAGE_KEYS.swipeHintShown, false) === true;
}

export function markSwipeHintShown() {
    set(STORAGE_KEYS.swipeHintShown, true);
}

/* =========================================================
   USER LINES + LINHA RECOMENDADA + SUGESTÃO DIÁRIA
   ========================================================= */

/** Lista de linhas criadas pelo usuário. */
export function getUserLines() {
    return get(STORAGE_KEYS.userLines, []);
}

/** Salva uma linha (cria se id ausente, atualiza se existente). */
export function saveUserLine(line) {
    const lines = getUserLines();
    if (!line.id) line.id = 'ul_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    if (!line.createdAt) line.createdAt = new Date().toISOString();
    const idx = lines.findIndex(l => l.id === line.id);
    if (idx >= 0) lines[idx] = line;
    else lines.push(line);
    set(STORAGE_KEYS.userLines, lines);
    return line.id;
}

/** Remove linha do usuário pelo id. */
export function deleteUserLine(id) {
    const lines = getUserLines().filter(l => l.id !== id);
    set(STORAGE_KEYS.userLines, lines);
}

/** Marca uma linha como completada agora. */
export function markUserLineCompleted(id) {
    const lines = getUserLines();
    const l = lines.find(x => x.id === id);
    if (l) {
        l.completedAt = new Date().toISOString();
        set(STORAGE_KEYS.userLines, lines);
    }
}

/** Linha recomendada do dia (gerada pelo algoritmo). */
export function getSuggestedLine() {
    return get(STORAGE_KEYS.suggestedLine, null);
}

export function setSuggestedLine(line) {
    set(STORAGE_KEYS.suggestedLine, line);
}

/** Sugestão diária de manobras pra mandar hoje. */
export function getDailySuggestion() {
    return get(STORAGE_KEYS.dailySugg, null);
}

export function setDailySuggestion(s) {
    set(STORAGE_KEYS.dailySugg, s);
}

/* =========================================================
   BOTS DESBLOQUEADOS (easter egg)
   ========================================================= */

/** Lista de bot ids desbloqueados via easter egg. */
export function getUnlockedBots() {
    return get(STORAGE_KEYS.unlockedBots, []);
}

/** Desbloqueia um ou mais bots. Idempotente — não duplica. */
export function unlockBots(botIds) {
    const current = getUnlockedBots();
    const ids = Array.isArray(botIds) ? botIds : [botIds];
    const merged = Array.from(new Set([...current, ...ids]));
    set(STORAGE_KEYS.unlockedBots, merged);
    return merged;
}

/** Verifica se um bot específico foi desbloqueado. */
export function isBotUnlocked(botId) {
    return getUnlockedBots().includes(botId);
}
