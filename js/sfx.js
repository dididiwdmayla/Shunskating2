/**
 * sfx.js — sons de interatividade gerados proceduralmente.
 *
 * Tudo em Web Audio (oscillators, noise, envelopes). Sem arquivos.
 * Toggle global via localStorage (key: shun_v2.sfx).
 */

const STORAGE_KEY = 'shun_v2.sfx';

let _ctx = null;
let _enabled = true;

(function loadPref() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw !== null) _enabled = raw === '1';
    } catch (e) { /* ignora */ }
})();

function ensureCtx() {
    if (_ctx) return _ctx;
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        _ctx = new Ctx();
    } catch (e) {
        return null;
    }
    return _ctx;
}

export function isEnabled() { return _enabled; }

export function setEnabled(on) {
    _enabled = !!on;
    try { localStorage.setItem(STORAGE_KEY, _enabled ? '1' : '0'); } catch (e) {}
}

/** Resume contexto se estiver suspenso. Chamar em primeira interação. */
export function resume() {
    const ctx = ensureCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

/** Toca uma "envelope" simples (gain ramp). */
function envelope(node, ctx, attack, decay, peak = 1, sustain = 0, sustainTime = 0, release = 0.01) {
    const t0 = ctx.currentTime;
    node.gain.setValueAtTime(0, t0);
    node.gain.linearRampToValueAtTime(peak, t0 + attack);
    node.gain.linearRampToValueAtTime(sustain, t0 + attack + decay);
    if (sustainTime > 0) {
        node.gain.setValueAtTime(sustain, t0 + attack + decay + sustainTime);
    }
    node.gain.linearRampToValueAtTime(0, t0 + attack + decay + sustainTime + release);
    return t0 + attack + decay + sustainTime + release;
}

/** Click curto e seco — botões grandes. "tac" de máquina. */
export function click() {
    if (!_enabled) return;
    const ctx = ensureCtx(); if (!ctx) return;
    resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(380, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.04);
    osc.connect(gain).connect(ctx.destination);
    const end = envelope(gain, ctx, 0.001, 0.04, 0.08, 0, 0, 0.01);
    osc.start();
    osc.stop(end + 0.01);
}

/** Click positivo — confirmar manobra acertada no game. Tom alto. */
export function clickPositive() {
    if (!_enabled) return;
    const ctx = ensureCtx(); if (!ctx) return;
    resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(780, ctx.currentTime + 0.06);
    osc.connect(gain).connect(ctx.destination);
    const end = envelope(gain, ctx, 0.002, 0.07, 0.12, 0, 0, 0.02);
    osc.start();
    osc.stop(end + 0.01);
}

/** Whoosh sutil — swipes/gestos. White noise rápido descendente. */
export function whoosh() {
    if (!_enabled) return;
    const ctx = ensureCtx(); if (!ctx) return;
    resume();
    // gera buffer de ruído branco curto
    const len = Math.floor(ctx.sampleRate * 0.18);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1);
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    // filtro passa-banda descendente
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2000, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.16);
    filter.Q.value = 1.5;
    const gain = ctx.createGain();
    noise.connect(filter).connect(gain).connect(ctx.destination);
    envelope(gain, ctx, 0.005, 0.15, 0.06, 0, 0, 0.02);
    noise.start();
    noise.stop(ctx.currentTime + 0.2);
}

/** Carimbada satisfatória — stamp QR / skatista novo. Thump grave + click. */
export function stamp() {
    if (!_enabled) return;
    const ctx = ensureCtx(); if (!ctx) return;
    resume();
    // thump: senoide grave que cai rápido
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.18);
    const gain = ctx.createGain();
    osc.connect(gain).connect(ctx.destination);
    envelope(gain, ctx, 0.002, 0.18, 0.35, 0, 0, 0.04);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);

    // click curto sobreposto pra dar "tato"
    const click = ctx.createOscillator();
    click.type = 'square';
    click.frequency.value = 1800;
    const cg = ctx.createGain();
    click.connect(cg).connect(ctx.destination);
    envelope(cg, ctx, 0.001, 0.02, 0.05, 0, 0, 0.005);
    click.start();
    click.stop(ctx.currentTime + 0.04);
}

/** Carimbada errada — bot errou no game. Borracha amassando: ruído curto + tom abafado. */
export function stampMiss() {
    if (!_enabled) return;
    const ctx = ensureCtx(); if (!ctx) return;
    resume();
    // ruído filtrado grave
    const len = Math.floor(ctx.sampleRate * 0.3);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1);
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    noise.connect(filter).connect(gain).connect(ctx.destination);
    envelope(gain, ctx, 0.01, 0.25, 0.18, 0, 0, 0.04);
    noise.start();
    noise.stop(ctx.currentTime + 0.32);

    // tom grave decrescente sobreposto
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.25);
    const og = ctx.createGain();
    osc.connect(og).connect(ctx.destination);
    envelope(og, ctx, 0.005, 0.22, 0.08, 0, 0, 0.04);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
}
