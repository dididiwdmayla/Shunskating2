/**
 * scroll-video.js — vídeo controlado por scroll com smoothing.
 *
 * Uso: scrollVideo.attach(containerEl, videoUrl, options)
 *
 * Estratégia:
 *  - Vídeo full-screen 100vw x 100vh, sticky no topo
 *  - currentTime do vídeo é interpolado suavemente (lerp) pro alvo
 *    determinado pelo scroll. Isso cria movimento contínuo mesmo a 30fps.
 *  - scrollPx maior = mais "preso" no vídeo durante o scroll
 */

import { el } from './utils.js';

/**
 * Anexa um vídeo scroll-driven a um container.
 *
 * @param {HTMLElement} container
 * @param {string} videoUrl
 * @param {object} opts - { scrollPx?: número, onReady?: function, onError?: function, smoothing?: número }
 *
 * smoothing: quanto da diferença atualiza por frame (0..1). default 0.18 (suave). 1.0 = sem smoothing.
 *
 * @returns { destroy() }
 */
export function attach(container, videoUrl, opts = {}) {
    const scrollPx = opts.scrollPx || 1200;
    const smoothing = opts.smoothing != null ? opts.smoothing : 0.18;
    const onReady = opts.onReady;
    const onError = opts.onError;

    const frame = el('div', { className: 'sv-frame' });
    frame.style.height = `${scrollPx + window.innerHeight}px`;

    const sticky = el('div', { className: 'sv-sticky' });

    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('disablepictureinpicture', '');
    video.controls = false;
    video.className = 'sv-video';
    video.autoplay = false;
    video.loop = false;

    const loading = el('div', { className: 'sv-loading' }, 'carregando manobra...');
    const fallbackBtn = el('button', {
        className: 'sv-fallback-btn',
        type: 'button',
        hidden: '',
        onClick: () => {
            video.play().catch(() => {});
            fallbackBtn.setAttribute('hidden', '');
        }
    }, '▶ tocar manualmente');

    sticky.appendChild(video);
    sticky.appendChild(loading);
    sticky.appendChild(fallbackBtn);
    frame.appendChild(sticky);
    container.appendChild(frame);

    let videoDuration = 0;
    let isReady = false;
    let scrollContainer = null;
    let onScroll = null;
    let loadTimeout = null;

    /* descobre o elemento que rola */
    function findScrollContainer() {
        let cur = container.parentElement;
        while (cur && cur !== document.body) {
            const cs = getComputedStyle(cur);
            if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') {
                return cur;
            }
            cur = cur.parentElement;
        }
        return window;
    }

    function getScrollY() {
        if (scrollContainer === window) return window.scrollY;
        return scrollContainer.scrollTop;
    }

    function getFramePosition() {
        if (scrollContainer === window) {
            return frame.getBoundingClientRect().top + window.scrollY;
        }
        return frame.offsetTop;
    }

    /* alvo (calculado por scroll) e atual (interpolado suavemente). */
    let targetTime = 0;
    let currentTime = 0;
    let rafId = null;

    /* loop de animação: roda continuamente enquanto current ≠ target.
     * Lerp: current += (target - current) * smoothing
     * Isso cria movimento suave mesmo se o scroll for em saltos. */
    function loop() {
        if (!isReady) {
            rafId = requestAnimationFrame(loop);
            return;
        }
        const diff = targetTime - currentTime;
        if (Math.abs(diff) > 0.005) {
            currentTime += diff * smoothing;
            try {
                video.currentTime = currentTime;
            } catch (e) { /* ignora */ }
        }
        rafId = requestAnimationFrame(loop);
    }

    /* atualiza target conforme scroll (sem aplicar direto — o loop faz isso) */
    function update() {
        if (!isReady || videoDuration === 0) return;
        const scrollY = getScrollY();
        const framePos = getFramePosition();
        const localScroll = Math.max(0, scrollY - framePos);
        const progress = Math.min(1, localScroll / scrollPx);
        targetTime = progress * videoDuration;
    }

    onScroll = () => update();

    video.addEventListener('loadedmetadata', () => {
        videoDuration = video.duration;
        isReady = true;
        loading.classList.add('is-fade');
        setTimeout(() => loading.remove(), 400);
        if (loadTimeout) { clearTimeout(loadTimeout); loadTimeout = null; }
        if (onReady) onReady();
        try { video.currentTime = 0; } catch (e) {}
        update();
    });

    video.addEventListener('error', () => {
        loading.textContent = 'não foi possível carregar o vídeo';
        if (onError) onError(video.error);
    });

    loadTimeout = setTimeout(() => {
        if (!isReady) {
            fallbackBtn.removeAttribute('hidden');
            loading.textContent = 'demorando? toca manual';
        }
    }, 8000);

    setTimeout(() => {
        scrollContainer = findScrollContainer();
        scrollContainer.addEventListener('scroll', onScroll, { passive: true });
        update();
        // inicia o loop de smoothing
        rafId = requestAnimationFrame(loop);
    }, 50);

    video.src = videoUrl;

    return {
        destroy() {
            if (rafId) cancelAnimationFrame(rafId);
            if (scrollContainer && onScroll) {
                scrollContainer.removeEventListener('scroll', onScroll);
            }
            if (loadTimeout) clearTimeout(loadTimeout);
            if (video.src) {
                video.pause();
                video.removeAttribute('src');
                video.load();
            }
            if (frame.parentElement) frame.remove();
        }
    };
}
