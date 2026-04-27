/**
 * lines-engine.js — geração inteligente de linhas.
 *
 * Princípios:
 *  - Só usa manobras com progresso médio >= 2 ("caindo" ou melhor)
 *  - Linha começa com 3, vai até 7
 *  - Heurística de sequência:
 *    * Abertura: prefere solo (mas pode ser conectada/borda)
 *    * Bordas (slides/grinds) intercaladas — não em sequência direta
 *    * Conectadas (ollie manual etc) preferem meio/fim
 *  - Sem repetição
 */

import { getProgressAverage } from './storage.js';

const MIN_PROGRESS = 2;

/** Filtra manobras elegíveis (progress >= 2). Retorna lista enriquecida. */
export function eligibleTricks(tricksData) {
    return tricksData.tricks.filter(t => {
        const p = getProgressAverage(t.id);
        return p >= MIN_PROGRESS;
    });
}

/** Gera uma linha recomendada com N manobras (default 3). */
export function generateLine(tricksData, size = 3, excludeIds = []) {
    const pool = eligibleTricks(tricksData).filter(t => !excludeIds.includes(t.id));
    if (pool.length === 0) return [];

    // Agrupa por role
    const byRole = { solo: [], manual: [], connected: [], edge: [] };
    pool.forEach(t => {
        const role = t.lineRole || 'solo';
        if (byRole[role]) byRole[role].push(t);
    });

    const line = [];
    const used = new Set();

    function pickFrom(roles, fallbackToAll = true) {
        for (const role of roles) {
            const candidates = byRole[role].filter(t => !used.has(t.id));
            if (candidates.length > 0) {
                const pick = candidates[Math.floor(Math.random() * candidates.length)];
                used.add(pick.id);
                return pick;
            }
        }
        if (fallbackToAll) {
            const all = pool.filter(t => !used.has(t.id));
            if (all.length === 0) return null;
            const pick = all[Math.floor(Math.random() * all.length)];
            used.add(pick.id);
            return pick;
        }
        return null;
    }

    /* Abertura — prefere solo, aceita qualquer */
    const opener = pickFrom(['solo', 'manual', 'connected', 'edge']);
    if (opener) line.push(opener);

    /* Próximas — intercala evitando borda em sequência */
    while (line.length < size) {
        const last = line[line.length - 1];
        let preferred;
        if (last && last.lineRole === 'edge') {
            // após borda, prefere solo/conectada/manual pra dar respiro
            preferred = ['solo', 'connected', 'manual', 'edge'];
        } else if (line.length === size - 1 && size >= 5) {
            // último de linha grande: bom encerrar com borda ou conectada
            preferred = ['edge', 'connected', 'solo', 'manual'];
        } else {
            // meio: equilibrado
            preferred = ['solo', 'connected', 'edge', 'manual'];
        }
        const pick = pickFrom(preferred);
        if (!pick) break;
        line.push(pick);
    }

    return line;
}

/** Retorna data atual em formato YYYY-MM-DD (local). */
export function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
}

/**
 * Gera ou retorna linha do dia (cache no storage).
 * Se a data salva é diferente da hoje, regenera.
 */
import { getSuggestedLine, setSuggestedLine } from './storage.js';

export function getOrGenerateLineOfTheDay(tricksData) {
    const cached = getSuggestedLine();
    const today = todayKey();
    if (cached && cached.date === today && cached.trickIds && cached.trickIds.length > 0) {
        return cached;
    }
    const line = generateLine(tricksData, 3);
    const newCached = {
        date: today,
        trickIds: line.map(t => t.id),
        regenCount: 0,
        completedAt: null
    };
    setSuggestedLine(newCached);
    return newCached;
}

/** Força regeneração da linha do dia (até MAX_REGEN por dia). */
const MAX_REGEN_PER_DAY = 3;
export function regenerateLineOfTheDay(tricksData) {
    const cached = getSuggestedLine();
    if (cached && cached.regenCount >= MAX_REGEN_PER_DAY) {
        return { error: 'limite diário atingido', cached };
    }
    const line = generateLine(tricksData, (cached && cached.trickIds.length) || 3, cached?.trickIds || []);
    const newCached = {
        date: todayKey(),
        trickIds: line.map(t => t.id),
        regenCount: (cached?.regenCount || 0) + 1,
        completedAt: null
    };
    setSuggestedLine(newCached);
    return { cached: newCached };
}

/** Adiciona +1 manobra à linha atual (até max 7). */
export function addOneToLine(tricksData, currentTrickIds) {
    if (currentTrickIds.length >= 7) return { error: 'máximo de 7' };
    const line = generateLine(tricksData, 1, currentTrickIds);
    if (line.length === 0) return { error: 'sem manobras elegíveis' };
    const updated = currentTrickIds.concat(line.map(t => t.id));
    const cached = getSuggestedLine() || { date: todayKey(), regenCount: 0, completedAt: null };
    cached.trickIds = updated;
    setSuggestedLine(cached);
    return { trickIds: updated };
}

/** Troca uma manobra na linha por outra escolhida. Aceita troca por qualquer manobra. */
export function replaceTrickInLine(currentTrickIds, indexToReplace, newTrickId) {
    if (indexToReplace < 0 || indexToReplace >= currentTrickIds.length) return null;
    const updated = currentTrickIds.slice();
    updated[indexToReplace] = newTrickId;
    const cached = getSuggestedLine() || { date: todayKey(), regenCount: 0, completedAt: null };
    cached.trickIds = updated;
    setSuggestedLine(cached);
    return updated;
}

/** Remove uma manobra da linha pelo índice. */
export function removeTrickFromLine(indexToRemove) {
    const cached = getSuggestedLine();
    if (!cached || !cached.trickIds) return null;
    if (cached.trickIds.length <= 1) return { error: 'linha precisa ter pelo menos 1' };
    cached.trickIds = cached.trickIds.filter((_, i) => i !== indexToRemove);
    setSuggestedLine(cached);
    return cached.trickIds;
}

/** Marca linha do dia como completada. */
export function markLineCompleted() {
    const cached = getSuggestedLine();
    if (!cached) return;
    cached.completedAt = new Date().toISOString();
    setSuggestedLine(cached);
}
