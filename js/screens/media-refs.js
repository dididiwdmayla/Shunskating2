/**
 * screens/media-refs.js
 *
 * Seções LINKS e VÍDEOS na tela de detalhe de manobra.
 * Ambos são por (trickId, stance) — cada aba de stance tem sua própria
 * coleção de referências, porque o que ajuda em regular é diferente
 * do que ajuda em fakie.
 *
 * LINKS:   armazenados em localStorage (dados pequenos)
 * VÍDEOS:  gravação direta via câmera do celular, Blob salvo em IndexedDB
 *          (localStorage não aguenta MBs de vídeo)
 */

import { el } from '../utils.js';
import { getLinks, addLink, removeLink } from '../storage.js';
import { getVideoMetas, saveVideo, getVideoUrl, deleteVideo } from '../video-db.js';

/* =========================================================
   SEÇÃO DE LINKS
   ========================================================= */

/**
 * Renderiza a seção de links. Retorna elemento pronto pra appendChild.
 * @param {object} state - { trick, stance, ... }
 */
export function renderLinksSection(state) {
    const section = el('div', { className: 'detail-section media-section' });
    section.appendChild(el('h3', { className: 'detail-section-title' }, 'LINKS'));

    // subtítulo explicativo
    section.appendChild(el('p', { className: 'media-hint' },
        'Tutoriais, vídeos do YouTube, artigos. Específicos deste stance.'
    ));

    const list = el('div', { className: 'links-list' });
    section.appendChild(list);

    const emptyEl = el('p', { className: 'media-empty' }, '— nenhum link salvo —');
    section.appendChild(emptyEl);

    // botão de adicionar
    const addBtn = el('button', {
        className: 'media-add-btn',
        type: 'button',
        onClick: () => promptAddLink(state, list, emptyEl)
    }, '+ ADICIONAR LINK');
    section.appendChild(addBtn);

    // render inicial
    refreshLinksList(list, emptyEl, state);

    return section;
}

function refreshLinksList(listEl, emptyEl, state) {
    const { trick, stance } = state;
    const links = getLinks(trick.id, stance);

    listEl.innerHTML = '';

    if (links.length === 0) {
        emptyEl.style.display = '';
        return;
    }
    emptyEl.style.display = 'none';

    links.forEach((lnk) => {
        const item = el('div', { className: 'link-item' });

        // favicon via url
        let host = '';
        try { host = new URL(lnk.url).hostname.replace(/^www\./, ''); } catch { host = 'link'; }

        const openBtn = el('a', {
            className: 'link-open',
            href: lnk.url,
            target: '_blank',
            rel: 'noopener noreferrer'
        },
            el('span', { className: 'link-host' }, host),
            el('span', { className: 'link-title' }, lnk.title || lnk.url)
        );
        item.appendChild(openBtn);

        const delBtn = el('button', {
            className: 'media-delete-btn',
            type: 'button',
            'aria-label': 'Remover link',
            title: 'Remover',
            onClick: () => {
                if (!confirm(`Remover este link?\n\n${lnk.title}`)) return;
                removeLink(trick.id, stance, lnk.id);
                refreshLinksList(listEl, emptyEl, state);
            }
        }, '×');
        item.appendChild(delBtn);

        listEl.appendChild(item);
    });
}

function promptAddLink(state, listEl, emptyEl) {
    const { trick, stance } = state;
    const url = prompt('Cola a URL do link:\n(ex: https://youtube.com/...)');
    if (!url || !url.trim()) return;

    const cleaned = url.trim();
    if (!/^https?:\/\//i.test(cleaned)) {
        alert('A URL precisa começar com http:// ou https://');
        return;
    }

    const title = prompt('Título do link (opcional — deixa em branco pra usar a URL):', '');
    addLink(trick.id, stance, cleaned, title ? title.trim() : '');
    refreshLinksList(listEl, emptyEl, state);
}

/* =========================================================
   SEÇÃO DE VÍDEOS
   ========================================================= */

export function renderVideosSection(state) {
    const section = el('div', { className: 'detail-section media-section' });
    section.appendChild(el('h3', { className: 'detail-section-title' }, 'VÍDEOS'));

    section.appendChild(el('p', { className: 'media-hint' },
        'Gravações suas tentando a manobra. Ficam salvas no celular (offline).'
    ));

    const list = el('div', { className: 'videos-list' });
    section.appendChild(list);

    const emptyEl = el('p', { className: 'media-empty' }, '— nenhum vídeo gravado —');
    section.appendChild(emptyEl);

    // input escondido — ativa câmera diretamente no celular
    const fileInput = el('input', {
        type: 'file',
        accept: 'video/*',
        capture: 'environment',  // câmera traseira; celular abre direto a gravação
        style: { display: 'none' },
        onChange: (e) => handleVideoRecorded(e, state, list, emptyEl)
    });
    section.appendChild(fileInput);

    const recordBtn = el('button', {
        className: 'media-add-btn media-record-btn',
        type: 'button',
        onClick: () => fileInput.click()
    }, '● GRAVAR VÍDEO');
    section.appendChild(recordBtn);

    // feedback de uso de espaço
    const sizeInfo = el('p', { className: 'media-size-info' });
    section.appendChild(sizeInfo);

    refreshVideosList(list, emptyEl, sizeInfo, state);

    return section;
}

async function handleVideoRecorded(event, state, listEl, emptyEl) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    // limpa input pra permitir gravar outro mesmo video depois
    event.target.value = '';

    // tenta extrair duração via elemento <video> antes de salvar
    const durationSec = await extractVideoDuration(file).catch(() => null);

    try {
        await saveVideo(state.trick.id, state.stance, file, durationSec);
        const section = listEl.closest('.media-section');
        const sizeInfo = section ? section.querySelector('.media-size-info') : null;
        refreshVideosList(listEl, emptyEl, sizeInfo, state);
    } catch (err) {
        console.error(err);
        alert('Não consegui salvar o vídeo. Pode ter passado do limite de armazenamento do navegador.');
    }
}

function extractVideoDuration(fileOrBlob) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        const url = URL.createObjectURL(fileOrBlob);
        video.src = url;
        video.onloadedmetadata = () => {
            URL.revokeObjectURL(url);
            resolve(video.duration);
        };
        video.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('não conseguiu ler metadata'));
        };
    });
}

async function refreshVideosList(listEl, emptyEl, sizeInfoEl, state) {
    const { trick, stance } = state;
    const videos = getVideoMetas(trick.id, stance);

    // limpa blob URLs anteriores pra não vazar memória
    listEl.querySelectorAll('video[src^="blob:"]').forEach(v => {
        try { URL.revokeObjectURL(v.src); } catch {}
    });
    listEl.innerHTML = '';

    if (videos.length === 0) {
        emptyEl.style.display = '';
        if (sizeInfoEl) sizeInfoEl.textContent = '';
        return;
    }
    emptyEl.style.display = 'none';

    // ordena mais recente primeiro
    const sorted = videos.slice().sort((a, b) =>
        new Date(b.addedAt) - new Date(a.addedAt));

    let totalBytes = 0;
    for (const meta of sorted) {
        totalBytes += meta.sizeBytes || 0;
        listEl.appendChild(await renderVideoItem(meta, state, listEl, emptyEl, sizeInfoEl));
    }

    if (sizeInfoEl) {
        sizeInfoEl.textContent = `${videos.length} vídeo${videos.length > 1 ? 's' : ''} · ${formatBytes(totalBytes)}`;
    }
}

async function renderVideoItem(meta, state, listEl, emptyEl, sizeInfoEl) {
    const item = el('div', { className: 'video-item' });

    // data formatada
    const addedDate = new Date(meta.addedAt);
    const addedLabel = addedDate.toLocaleDateString('pt-BR', {
        day: '2-digit', month: 'short', year: 'numeric'
    }).toUpperCase();

    // header do item
    const header = el('div', { className: 'video-item-header' },
        el('span', { className: 'video-date' }, addedLabel),
        el('span', { className: 'video-meta' },
            formatBytes(meta.sizeBytes || 0),
            meta.durationSec ? ` · ${formatDuration(meta.durationSec)}` : ''
        )
    );

    const delBtn = el('button', {
        className: 'media-delete-btn',
        type: 'button',
        'aria-label': 'Remover vídeo',
        title: 'Remover',
        onClick: async () => {
            if (!confirm('Remover este vídeo? Não tem como desfazer.')) return;
            try {
                await deleteVideo(state.trick.id, state.stance, meta.id);
                refreshVideosList(listEl, emptyEl, sizeInfoEl, state);
            } catch (err) {
                console.error(err);
                alert('Falha ao remover vídeo.');
            }
        }
    }, '×');
    header.appendChild(delBtn);
    item.appendChild(header);

    // player lazy — só carrega quando item entra na viewport
    const videoEl = el('video', {
        className: 'video-player',
        controls: '',
        preload: 'none',
        playsinline: ''
    });
    item.appendChild(videoEl);

    // carrega URL blob imediatamente (já tá no IDB local, é rápido)
    try {
        videoEl.src = await getVideoUrl(meta.id);
    } catch (err) {
        videoEl.remove();
        item.appendChild(el('p', { className: 'video-error' }, 'erro ao carregar vídeo'));
    }

    return item;
}

/* =========================================================
   HELPERS
   ========================================================= */

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDuration(sec) {
    if (!sec || !isFinite(sec)) return '';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

export default { renderLinksSection, renderVideosSection };
