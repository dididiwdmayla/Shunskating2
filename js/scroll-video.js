/**
 * scroll-video.js — vídeo controlado por scroll.
 *
 * Uso: scrollVideo.attach(containerEl, videoUrl, options)
 *
 * Cria um <video> dentro do container, e mapeia a posição de scroll
 * do screen-wrapper (NÃO da window, porque o app rola num container interno)
 * para o currentTime do vídeo.
 *
 * Estratégia:
 *  - Vídeo é "sticky" no topo durante a fase scroll-driven
 *  - Conteúdo abaixo empurra a tela pra cima conforme você desce
 *  - Quando você passou de "scrollEndPx", o vídeo destrava e fica fixo no último frame
 */

import { el } from './utils.js';

/**
 * Anexa um vídeo scroll-driven a um container.
 *
 * @param {HTMLElement} container - elemento que vai conter o vídeo
 * @param {string} videoUrl - URL do mp4
 * @param {object} opts - { scrollPx?: número, onReady?: function, onError?: function }
 *
 * scrollPx é quantos pixels de scroll equivalem ao vídeo inteiro. default: 600.
 *
 * @returns { destroy() } — função pra desanexar listeners
 */
export function attach(container, videoUrl, opts = {}) {
    const scrollPx = opts.scrollPx || 600;
    const onReady = opts.onReady;
    const onError = opts.onError;

    /* estrutura:
     *   .sv-frame  (altura = scrollPx + 75vh; serve de área de scroll)
     *     .sv-sticky (sticky top, contém o vídeo)
     *       <video>
     *       .sv-fallback-btn (aparece se vídeo demora)
     *       .sv-loading (placeholder)
     */
    const frame = el('div', { className: 'sv-frame' });
    frame.style.height = `${scrollPx + window.innerHeight * 0.75}px`;

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
    // não toca automaticamente — começamos pausado no frame 0
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

    /* descobre o elemento que de fato faz scroll —
     * geralmente é #screen-container (o wrapper de telas) */
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
        // posição do .sv-frame relativa ao topo do scrollContainer
        if (scrollContainer === window) {
            return frame.getBoundingClientRect().top + window.scrollY;
        }
        // se for container interno: offsetTop dentro do container
        return frame.offsetTop;
    }

    /* atualiza o currentTime do vídeo conforme o scroll */
    function update() {
        if (!isReady || videoDuration === 0) return;
        const scrollY = getScrollY();
        const framePos = getFramePosition();
        const localScroll = Math.max(0, scrollY - framePos);
        const progress = Math.min(1, localScroll / scrollPx);
        const target = progress * videoDuration;
        // só ajusta se a diferença for significativa, pra reduzir trabalho
        if (Math.abs(video.currentTime - target) > 0.02) {
            try {
                video.currentTime = target;
            } catch (e) { /* alguns browsers throw em meta inválido */ }
        }
    }

    /* loop com requestAnimationFrame pra suavizar — em vez de listener direto */
    let scheduled = false;
    onScroll = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            update();
            scheduled = false;
        });
    };

    /* inicializa quando metadata carrega */
    video.addEventListener('loadedmetadata', () => {
        videoDuration = video.duration;
        isReady = true;
        loading.classList.add('is-fade');
        setTimeout(() => loading.remove(), 400);
        if (loadTimeout) { clearTimeout(loadTimeout); loadTimeout = null; }
        if (onReady) onReady();
        // primeiro frame
        try { video.currentTime = 0; } catch (e) {}
        update();
    });

    /* erro de vídeo */
    video.addEventListener('error', () => {
        loading.textContent = 'não foi possível carregar o vídeo';
        if (onError) onError(video.error);
    });

    /* timeout de fallback: 8s sem load = mostra botão "tocar manualmente" */
    loadTimeout = setTimeout(() => {
        if (!isReady) {
            fallbackBtn.removeAttribute('hidden');
            loading.textContent = 'demorando? toca manual';
        }
    }, 8000);

    /* depois de tudo pronto, atacha listener de scroll */
    setTimeout(() => {
        scrollContainer = findScrollContainer();
        scrollContainer.addEventListener('scroll', onScroll, { passive: true });
        update();
    }, 50);

    /* set source — depois dos listeners */
    video.src = videoUrl;

    return {
        destroy() {
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
