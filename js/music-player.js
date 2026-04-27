/**
 * music-player.js — engine de música.
 *
 * Estado global (module-level singleton). Mantém:
 *   - elemento <audio> persistente (sobrevive trocas de tela)
 *   - track atual e fila
 *   - subscribers que escutam mudanças
 *
 * UI consome via subscribe()/getState() e controla via play/pause/etc.
 */

import { getTrack } from './music-db.js';

const state = {
    audio: null,           // HTMLAudioElement
    currentId: null,       // id da track tocando
    currentTrack: null,    // metadata da track (sem blob)
    queue: [],             // [{ id, title, ... }, ...] — próximas, NÃO inclui current
    history: [],           // [{ id, ... }, ...] — anteriores
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1.0,
    miniHidden: false,     // true = esconde mini-player, áudio segue
    objectUrl: null        // URL.createObjectURL atual, pra revogar depois
};

const subscribers = new Set();

/** Garante que o elemento audio existe. */
function ensureAudio() {
    if (state.audio) return state.audio;
    const a = new Audio();
    a.preload = 'metadata';
    a.volume = state.volume;
    a.addEventListener('timeupdate', () => {
        state.currentTime = a.currentTime;
        notify();
    });
    a.addEventListener('loadedmetadata', () => {
        state.duration = a.duration || 0;
        notify();
    });
    a.addEventListener('ended', () => {
        playNext();
    });
    a.addEventListener('play', () => { state.isPlaying = true; notify(); });
    a.addEventListener('pause', () => { state.isPlaying = false; notify(); });
    a.addEventListener('error', (e) => {
        console.warn('[player] audio error', e);
        state.isPlaying = false;
        notify();
    });
    state.audio = a;
    return a;
}

function notify() {
    subscribers.forEach(fn => {
        try { fn(getState()); } catch (e) { console.warn('[player] subscriber erro', e); }
    });
}

/** Snapshot do estado atual (sem o elemento audio). */
export function getState() {
    return {
        currentId: state.currentId,
        currentTrack: state.currentTrack,
        queue: state.queue.slice(),
        history: state.history.slice(),
        isPlaying: state.isPlaying,
        currentTime: state.currentTime,
        duration: state.duration,
        volume: state.volume,
        miniHidden: state.miniHidden
    };
}

/** Inscreve callback que recebe o estado quando muda. Retorna função pra desinscrever. */
export function subscribe(fn) {
    subscribers.add(fn);
    fn(getState());
    return () => subscribers.delete(fn);
}

/** Carrega uma track no audio e começa a tocar. */
export async function loadAndPlay(trackId) {
    const audio = ensureAudio();
    const track = await getTrack(trackId);
    if (!track) {
        console.warn('[player] track não existe:', trackId);
        return false;
    }

    // Revoga URL antiga pra liberar memória
    if (state.objectUrl) {
        URL.revokeObjectURL(state.objectUrl);
        state.objectUrl = null;
    }

    const url = URL.createObjectURL(track.blob);
    state.objectUrl = url;
    audio.src = url;
    state.currentId = track.id;
    state.currentTrack = {
        id: track.id, title: track.title, artist: track.artist,
        album: track.album, duration: track.duration, type: track.type
    };
    state.currentTime = 0;
    state.duration = track.duration || 0;
    state.miniHidden = false; // reaparece em troca de música
    notify();

    try {
        await audio.play();
    } catch (e) {
        console.warn('[player] play falhou', e);
    }
    return true;
}

/** Toca/pausa o áudio atual. */
export function togglePlay() {
    const audio = ensureAudio();
    if (!state.currentId) return;
    if (audio.paused) audio.play().catch(e => console.warn(e));
    else audio.pause();
}

/** Pula pra track anterior (do history) ou volta ao início se for o 1º. */
export function playPrev() {
    const audio = ensureAudio();
    // se passou de 3s, volta ao início
    if (state.currentTime > 3) {
        audio.currentTime = 0;
        return;
    }
    if (state.history.length === 0) {
        audio.currentTime = 0;
        return;
    }
    // tira o último do history e toca
    const prev = state.history.pop();
    if (state.currentTrack) state.queue.unshift(state.currentTrack);
    loadAndPlay(prev.id);
}

/** Pula pra próxima da fila. Se fila vazia, para. */
export function playNext() {
    if (state.currentTrack) state.history.push(state.currentTrack);
    const next = state.queue.shift();
    if (!next) {
        // fim da fila — pausa
        const audio = ensureAudio();
        audio.pause();
        if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
        state.objectUrl = null;
        state.audio.src = '';
        state.currentId = null;
        state.currentTrack = null;
        state.currentTime = 0;
        state.duration = 0;
        notify();
        return;
    }
    loadAndPlay(next.id);
}

/** Troca a fila inteira (substitui). */
export function setQueue(tracks) {
    state.queue = tracks.slice();
    notify();
}

/** Toca uma track imediatamente. Demais entram na fila. */
export function playTrackNow(track, restOfQueue = []) {
    state.queue = restOfQueue.slice();
    if (state.currentTrack) state.history.push(state.currentTrack);
    loadAndPlay(track.id);
}

/** Adiciona uma track no fim da fila. */
export function enqueue(track) {
    state.queue.push(track);
    notify();
}

/** Insere uma track logo depois da atual ("tocar a seguir"). */
export function playNextTrack(track) {
    state.queue.unshift(track);
    notify();
}

/** Remove uma track da fila pelo índice. */
export function removeFromQueue(index) {
    state.queue.splice(index, 1);
    notify();
}

/** Move item na fila (drag-drop). */
export function moveInQueue(from, to) {
    const item = state.queue.splice(from, 1)[0];
    if (item) state.queue.splice(to, 0, item);
    notify();
}

/** Pula pra um ponto no tempo (em segundos). */
export function seek(seconds) {
    const audio = ensureAudio();
    audio.currentTime = Math.max(0, Math.min(seconds, state.duration || 0));
}

/** Ajusta volume (0..1). */
export function setVolume(v) {
    const audio = ensureAudio();
    state.volume = Math.max(0, Math.min(1, v));
    audio.volume = state.volume;
    notify();
}

/** Esconde o mini-player visualmente (áudio segue tocando). */
export function hideMini() {
    state.miniHidden = true;
    notify();
}

/** Volta a mostrar o mini-player. */
export function showMini() {
    state.miniHidden = false;
    notify();
}

/** Retorna true se algo está em estado de player ativo (tocando ou pausado mas com track carregada). */
export function isActive() {
    return !!state.currentId;
}
