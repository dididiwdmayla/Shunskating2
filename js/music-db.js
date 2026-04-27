/**
 * music-db.js — IndexedDB pra guardar tracks de música.
 *
 * Estrutura:
 *   db: shun_music_v1
 *     store: tracks
 *       key: id (uuid string)
 *       value: { id, title, artist, album, duration, type, addedAt, blob }
 *
 * blob é o arquivo de áudio inteiro. Acessar via URL.createObjectURL().
 */

const DB_NAME = 'shun_music_v1';
const DB_VERSION = 1;
const STORE = 'tracks';

let _dbPromise = null;

function openDb() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) {
                const store = db.createObjectStore(STORE, { keyPath: 'id' });
                store.createIndex('addedAt', 'addedAt');
                store.createIndex('title', 'title');
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return _dbPromise;
}

function tx(mode = 'readonly') {
    return openDb().then(db => db.transaction(STORE, mode).objectStore(STORE));
}

/** Adiciona uma track. Retorna o id criado. */
export async function addTrack({ title, artist, album, duration, type, blob }) {
    const id = crypto.randomUUID ? crypto.randomUUID() : 't_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const track = {
        id,
        title: title || 'Sem título',
        artist: artist || '',
        album: album || '',
        duration: duration || 0,
        type: type || 'audio/mpeg',
        addedAt: Date.now(),
        blob
    };
    const store = await tx('readwrite');
    return new Promise((res, rej) => {
        const r = store.add(track);
        r.onsuccess = () => res(id);
        r.onerror = () => rej(r.error);
    });
}

/** Pega uma track inteira (com blob). */
export async function getTrack(id) {
    const store = await tx();
    return new Promise((res, rej) => {
        const r = store.get(id);
        r.onsuccess = () => res(r.result || null);
        r.onerror = () => rej(r.error);
    });
}

/** Lista todas as tracks (sem blob — pra economia de memória). */
export async function listTracks() {
    const store = await tx();
    return new Promise((res, rej) => {
        const r = store.openCursor();
        const out = [];
        r.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                const t = cursor.value;
                // omite blob no listing
                out.push({
                    id: t.id, title: t.title, artist: t.artist, album: t.album,
                    duration: t.duration, type: t.type, addedAt: t.addedAt,
                    size: t.blob && t.blob.size ? t.blob.size : 0
                });
                cursor.continue();
            } else {
                // ordena por addedAt asc (mais antigas primeiro)
                out.sort((a, b) => a.addedAt - b.addedAt);
                res(out);
            }
        };
        r.onerror = () => rej(r.error);
    });
}

/** Atualiza metadata de uma track (sem mexer no blob). */
export async function updateTrack(id, patch) {
    const store = await tx('readwrite');
    return new Promise((res, rej) => {
        const r = store.get(id);
        r.onsuccess = () => {
            const t = r.result;
            if (!t) return rej(new Error('track não encontrada'));
            Object.assign(t, patch);
            const w = store.put(t);
            w.onsuccess = () => res(true);
            w.onerror = () => rej(w.error);
        };
        r.onerror = () => rej(r.error);
    });
}

/** Deleta uma track. */
export async function deleteTrack(id) {
    const store = await tx('readwrite');
    return new Promise((res, rej) => {
        const r = store.delete(id);
        r.onsuccess = () => res(true);
        r.onerror = () => rej(r.error);
    });
}

/** Calcula tamanho total das tracks em bytes. */
export async function totalSize() {
    const list = await listTracks();
    return list.reduce((s, t) => s + (t.size || 0), 0);
}
