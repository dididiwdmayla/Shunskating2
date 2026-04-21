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
    settings:   `${STORAGE_VERSION}.settings`    // { audioEnabled, reducedMotion, ... }
};

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

/* ---------- helpers de alto nível ---------- */

/** Progresso: lê nível de uma combinação (trickId, stance). */
export function getProgress(trickId, stance) {
    const all = get(STORAGE_KEYS.progress, {});
    return (all[trickId] && all[trickId][stance]) || 0;
}

/** Progresso: grava nível. */
export function setProgress(trickId, stance, level) {
    const all = get(STORAGE_KEYS.progress, {});
    if (!all[trickId]) all[trickId] = {};
    all[trickId][stance] = level;
    set(STORAGE_KEYS.progress, all);
}

/** Progresso: retorna média dos 4 stances (para cards do catálogo). */
export function getProgressAverage(trickId) {
    const all = get(STORAGE_KEYS.progress, {});
    const t = all[trickId];
    if (!t) return 0;
    const values = ['regular', 'switch', 'fakie', 'nollie'].map((s) => t[s] || 0);
    const sum = values.reduce((a, b) => a + b, 0);
    return Math.round(sum / 4);
}

/** Notas: lê nota de (trickId, stance). */
export function getNote(trickId, stance) {
    const all = get(STORAGE_KEYS.notes, {});
    return (all[trickId] && all[trickId][stance]) || '';
}

/** Notas: grava nota (texto vazio remove). */
export function setNote(trickId, stance, text) {
    const all = get(STORAGE_KEYS.notes, {});
    if (!all[trickId]) all[trickId] = {};
    if (!text) {
        delete all[trickId][stance];
        if (Object.keys(all[trickId]).length === 0) delete all[trickId];
    } else {
        all[trickId][stance] = text;
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

/** Highlights: lê highlights de (trickId, stance). */
export function getHighlights(trickId, stance) {
    const all = get(STORAGE_KEYS.highlights, {});
    return all[`${trickId}|${stance}`] || [];
}

/** Highlights: grava lista completa (substituindo anterior). */
export function setHighlights(trickId, stance, list) {
    const all = get(STORAGE_KEYS.highlights, {});
    const k = `${trickId}|${stance}`;
    if (!list || list.length === 0) {
        delete all[k];
    } else {
        all[k] = list;
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
