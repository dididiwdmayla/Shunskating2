/**
 * video-db.js
 * Wrapper simples de IndexedDB pra armazenar vídeos como Blobs.
 *
 * Por que não localStorage: vídeos podem ter dezenas de MB. localStorage
 * tem limite de ~5MB e armazena tudo como string (base64 infla 33%).
 * IndexedDB aguenta Blobs direto, sem serializar, e tem cota generosa.
 *
 * Metadata (lista de vídeos por trickId/stance) fica em localStorage
 * pra leitura rápida; os blobs em si ficam no IDB acessados por id.
 */

const DB_NAME  = 'shunskating_v2_media';
const DB_VERSION = 1;
const STORE    = 'videos';
const META_KEY = 'shun_v2.videosMeta';

/* ---------- conexão com IDB ---------- */

let _dbPromise = null;

function openDb() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return _dbPromise;
}

/* ---------- metadata (localStorage) ---------- */

function readMeta() {
    try {
        const raw = localStorage.getItem(META_KEY);
        if (!raw) return {};
        return JSON.parse(raw);
    } catch (err) {
        console.warn('[video-db] meta read falhou:', err);
        return {};
    }
}

function writeMeta(meta) {
    try {
        localStorage.setItem(META_KEY, JSON.stringify(meta));
        return true;
    } catch (err) {
        console.warn('[video-db] meta write falhou:', err);
        return false;
    }
}

/* ---------- API pública ---------- */

/** Retorna lista de videoMeta para (trickId, stance). */
export function getVideoMetas(trickId, stance) {
    const meta = readMeta();
    return meta[`${trickId}|${stance}`] || [];
}

/**
 * Salva um blob de vídeo.
 * @returns {Promise<object>} videoMeta salvo
 */
export async function saveVideo(trickId, stance, blob, durationSec = null) {
    const db = await openDb();
    const id = 'vid_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

    await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ id, blob });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });

    const videoMeta = {
        id,
        trickId,
        stance,
        sizeBytes: blob.size,
        mimeType: blob.type || 'video/mp4',
        durationSec,
        addedAt: new Date().toISOString()
    };

    const meta = readMeta();
    const key = `${trickId}|${stance}`;
    if (!meta[key]) meta[key] = [];
    meta[key].push(videoMeta);
    writeMeta(meta);

    return videoMeta;
}

/**
 * Retorna o Blob de um vídeo. Reject se não existir.
 */
export async function getVideoBlob(videoId) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(videoId);
        req.onsuccess = () => {
            if (req.result) resolve(req.result.blob);
            else reject(new Error('Vídeo não encontrado: ' + videoId));
        };
        req.onerror = () => reject(req.error);
    });
}

/**
 * Deleta vídeo (IDB + metadata).
 */
export async function deleteVideo(trickId, stance, videoId) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(videoId);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });

    const meta = readMeta();
    const key = `${trickId}|${stance}`;
    if (meta[key]) {
        meta[key] = meta[key].filter(v => v.id !== videoId);
        if (meta[key].length === 0) delete meta[key];
        writeMeta(meta);
    }
}

/**
 * Retorna URL blob pra uso em <video src=...>.
 * Lembrar de URL.revokeObjectURL() depois de usar.
 */
export async function getVideoUrl(videoId) {
    const blob = await getVideoBlob(videoId);
    return URL.createObjectURL(blob);
}

/**
 * Cálculo aproximado do espaço usado em vídeos.
 */
export function getTotalVideoSize() {
    const meta = readMeta();
    let total = 0;
    for (const key in meta) {
        for (const v of meta[key]) total += v.sizeBytes || 0;
    }
    return total;
}
