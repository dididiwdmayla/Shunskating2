/**
 * daily-suggestion.js — sugere 1-2 manobras pra mandar hoje.
 *
 * Filtros:
 *  - Manobras catalogadas (não game-only)
 *  - Não dominadas (progresso < 4)
 *  - Pelo menos um pré-requisito com progresso >= 2 (ou sem prereqs)
 *
 * Score:
 *  - +5 se progresso >= 2 (você já tá tentando, vamos consolidar)
 *  - +3 se progresso == 1 (entendendo)
 *  - +1 se progresso == 0 (pra introduzir aos poucos)
 *  - -2 se já apareceu nos últimos 3 dias (rotação)
 *
 * Determinístico por dia: usa data como seed do shuffle.
 */

import { getProgress, getProgressAverage, getDailySuggestion, setDailySuggestion } from './storage.js';
import { todayKey } from './lines-engine.js';

/** Hash de string -> int. */
function hashString(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) >>> 0;
    }
    return h;
}

/** Random determinístico baseado em seed (Mulberry32). */
function seededRandom(seed) {
    return function() {
        seed = (seed + 0x6D2B79F5) >>> 0;
        let t = seed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Avalia se prereqs estão cumpridos pra essa trick. */
function prereqsOk(trick) {
    const prereqs = trick.prerequisites || [];
    if (prereqs.length === 0) return true;
    // pelo menos um prereq tem progresso >= 2
    return prereqs.some(pid => getProgressAverage(pid) >= 2);
}

/** Gera (ou retorna do cache) sugestão do dia. */
export function getOrGenerateDaily(tricksData) {
    const cached = getDailySuggestion();
    const today = todayKey();
    if (cached && cached.date === today && cached.trickIds && cached.trickIds.length > 0) {
        return cached;
    }

    // Filtra
    const eligible = tricksData.tricks.filter(t => {
        const avg = getProgressAverage(t.id);
        if (avg >= 4) return false;            // já dominada
        if (!prereqsOk(t)) return false;
        return true;
    });

    if (eligible.length === 0) {
        const empty = { date: today, trickIds: [], attempts: cached?.attempts || {} };
        setDailySuggestion(empty);
        return empty;
    }

    // Score
    const recentlyShown = (cached?.recentIds || []);
    const scored = eligible.map(t => {
        const avg = getProgressAverage(t.id);
        let score = 0;
        if (avg >= 3) score += 4;
        else if (avg >= 2) score += 5;
        else if (avg >= 1) score += 3;
        else score += 1;
        if (recentlyShown.includes(t.id)) score -= 2;
        return { trick: t, score: Math.max(0.1, score) };
    });

    // Sorteio determinístico ponderado por score
    const rand = seededRandom(hashString(today));
    const picks = [];
    const usedIds = new Set();

    for (let i = 0; i < 2; i++) {
        const remaining = scored.filter(s => !usedIds.has(s.trick.id));
        if (remaining.length === 0) break;
        const total = remaining.reduce((s, x) => s + x.score, 0);
        let r = rand() * total;
        let pick = remaining[0];
        for (const x of remaining) {
            r -= x.score;
            if (r <= 0) { pick = x; break; }
        }
        picks.push(pick.trick);
        usedIds.add(pick.trick.id);
    }

    // Atualiza recentIds (últimas 6 sugestões)
    const newRecent = (recentlyShown.concat(picks.map(p => p.id))).slice(-6);

    const updated = {
        date: today,
        trickIds: picks.map(p => p.id),
        attempts: cached?.attempts || {},
        recentIds: newRecent
    };
    setDailySuggestion(updated);
    return updated;
}

/** Marca tentativa de uma manobra hoje (sem mexer no progresso). */
export function markAttempt(trickId) {
    const today = todayKey();
    const cached = getDailySuggestion() || { date: today, trickIds: [], attempts: {}, recentIds: [] };
    if (!cached.attempts) cached.attempts = {};
    cached.attempts[trickId] = today;
    setDailySuggestion(cached);
}

/** Retorna data da última tentativa de uma manobra (ou null). */
export function getLastAttempt(trickId) {
    const cached = getDailySuggestion();
    if (!cached || !cached.attempts) return null;
    return cached.attempts[trickId] || null;
}

/** Confere se tentou hoje. */
export function attemptedToday(trickId) {
    const cached = getDailySuggestion();
    if (!cached || !cached.attempts) return false;
    return cached.attempts[trickId] === todayKey();
}
