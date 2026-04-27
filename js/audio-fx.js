/**
 * audio-fx.js — equalizador 7 bandas via Web Audio API.
 *
 * Conecta-se ao elemento <audio> do player via createMediaElementSource.
 * Os 7 filtros BiquadFilter formam uma cadeia: source -> EQ1 -> EQ2 -> ... -> destination.
 *
 * Persistência via localStorage (key: shun_v2.eq).
 */

const STORAGE_KEY = 'shun_v2.eq';

export const EQ_BANDS = [
    { freq: 60,    label: '60'   },  // sub-bass
    { freq: 150,   label: '150'  },  // bass
    { freq: 400,   label: '400'  },  // low-mid
    { freq: 1000,  label: '1k'   },  // mid
    { freq: 2500,  label: '2.5k' },  // high-mid
    { freq: 6000,  label: '6k'   },  // presence
    { freq: 12000, label: '12k'  }   // air
];

/* gain padrão por banda (dB) — leve bass boost */
export const DEFAULT_GAINS = [3, 2, 0, 0, 0, 0, 1];

const PRESETS = {
    flat:      [0, 0, 0, 0, 0, 0, 0],
    bassBoost: [6, 4, 1, 0, 0, 0, 0],
    vocal:     [-2, -1, 1, 3, 3, 2, 0],
    lofi:      [3, 2, -1, -2, -3, -4, -6],
    bright:    [0, 0, 0, 1, 3, 5, 6],
    skate:     [4, 3, 1, 0, 1, 2, 1] // padrão "skate" com graves e brilho
};

const state = {
    ctx: null,            // AudioContext
    source: null,         // MediaElementSourceNode
    filters: [],          // [BiquadFilter, ...] na ordem das bandas
    gains: DEFAULT_GAINS.slice(),
    enabled: true,
    initialized: false,
    audioEl: null
};

const subscribers = new Set();

function notify() {
    subscribers.forEach(fn => {
        try { fn(getState()); } catch (e) { console.warn('[fx] sub erro', e); }
    });
}

export function subscribe(fn) {
    subscribers.add(fn);
    fn(getState());
    return () => subscribers.delete(fn);
}

export function getState() {
    return {
        gains: state.gains.slice(),
        enabled: state.enabled,
        initialized: state.initialized
    };
}

/** Inicializa o EQ conectando ao elemento <audio>.
 *  IMPORTANTE: deve ser chamado APÓS uma interação do usuário
 *  (Web Audio é bloqueado antes disso no Android/iOS). */
export function init(audioEl) {
    if (state.initialized || !audioEl) return;
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) {
            console.warn('[fx] Web Audio não disponível');
            return;
        }
        state.ctx = new Ctx();
        state.audioEl = audioEl;
        state.source = state.ctx.createMediaElementSource(audioEl);

        // cria os filtros — primeiro lowshelf, último highshelf, intermediários peaking
        state.filters = EQ_BANDS.map((band, i) => {
            const f = state.ctx.createBiquadFilter();
            if (i === 0) f.type = 'lowshelf';
            else if (i === EQ_BANDS.length - 1) f.type = 'highshelf';
            else f.type = 'peaking';
            f.frequency.value = band.freq;
            f.Q.value = 1.0;
            f.gain.value = 0;
            return f;
        });

        // restaura estado salvo
        loadFromStorage();

        // conecta cadeia: source -> f0 -> f1 -> ... -> destination
        rewireGraph();

        state.initialized = true;
        notify();
    } catch (e) {
        console.warn('[fx] init falhou', e);
    }
}

/** Reconstrói o grafo de áudio respeitando o estado enabled. */
function rewireGraph() {
    if (!state.ctx || !state.source) return;
    try {
        state.source.disconnect();
        state.filters.forEach(f => f.disconnect());
    } catch (e) { /* ignora "not connected" */ }

    if (state.enabled) {
        state.source.connect(state.filters[0]);
        for (let i = 0; i < state.filters.length - 1; i++) {
            state.filters[i].connect(state.filters[i + 1]);
        }
        state.filters[state.filters.length - 1].connect(state.ctx.destination);
        applyGains();
    } else {
        state.source.connect(state.ctx.destination);
    }
}

/** Aplica os gains atuais aos filtros. */
function applyGains() {
    state.filters.forEach((f, i) => {
        f.gain.value = state.gains[i] || 0;
    });
}

/** Define o gain de uma banda específica em dB. */
export function setBandGain(index, dB) {
    if (index < 0 || index >= EQ_BANDS.length) return;
    state.gains[index] = Math.max(-12, Math.min(12, dB));
    if (state.enabled && state.filters[index]) {
        state.filters[index].gain.value = state.gains[index];
    }
    saveToStorage();
    notify();
}

/** Aplica um preset. */
export function applyPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;
    state.gains = preset.slice();
    if (state.enabled) applyGains();
    saveToStorage();
    notify();
}

/** Toggle do EQ (true/false). Quando off, o som passa direto. */
export function setEnabled(enabled) {
    state.enabled = !!enabled;
    rewireGraph();
    saveToStorage();
    notify();
}

/** Resume o AudioContext se estiver suspenso (necessário em algumas situações). */
export function resume() {
    if (state.ctx && state.ctx.state === 'suspended') {
        state.ctx.resume().catch(() => {});
    }
}

export function getPresets() {
    return Object.keys(PRESETS);
}

function saveToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            gains: state.gains,
            enabled: state.enabled
        }));
    } catch (e) { /* ignora */ }
}

function loadFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (Array.isArray(data.gains) && data.gains.length === EQ_BANDS.length) {
            state.gains = data.gains.slice();
        }
        if (typeof data.enabled === 'boolean') {
            state.enabled = data.enabled;
        }
    } catch (e) { /* ignora */ }
}
