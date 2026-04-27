/**
 * screens/skatistas.js
 *
 * Tela principal de Skatistas:
 *  - Seu carimbo no topo
 *  - Galeria de todos os skatistas carimbados
 *  - Botões: mostrar meu QR, escanear QR, gerenciar crews
 *  - Lista de crews
 *
 * Integra: storage, stamp-gen, qr-gen, camera scan via jsQR (CDN).
 */

import { el, escapeHtml } from '../utils.js';
import * as sfx from '../sfx.js';
import {
    getMyIdentity, setMyIdentity,
    getCrew, addToCrew, removeFromCrew,
    getCrews, createCrew, updateCrew, deleteCrew, toggleCrewMember,
    isOnboardingSkatistasDone, markOnboardingSkatistasDone
} from '../storage.js';
import { stampSvgFromId, stampDataFromId } from '../stamp-gen.js';
import { generateQrSvg } from '../qr-gen.js';

const SIGNATURE_VERSION = 1;

async function render(container, params = {}) {
    // verifica onboarding
    if (!isOnboardingSkatistasDone() || !getMyIdentity()) {
        const onboarding = await import('./onboarding-skatistas.js');
        return onboarding.default.render(container, {
            onDone: () => render(container, params)
        });
    }
    renderMain(container);
}

function renderMain(container) {
    container.innerHTML = '';
    const me = getMyIdentity();
    const crew = getCrew();
    const crews = getCrews();

    const screen = el('div', { className: 'screen-skatistas' });

    // Topo: meu carimbo
    screen.appendChild(renderMyStamp(me, crew.length));

    // Ações principais
    const actions = el('div', { className: 'skat-actions' });
    actions.appendChild(el('button', {
        className: 'skat-action-btn skat-action-primary',
        type: 'button',
        onClick: () => openMyQr(me)
    }, el('span', { className: 'skat-action-icon' }, '▣'),
       el('span', {}, 'MOSTRAR MEU QR')));
    actions.appendChild(el('button', {
        className: 'skat-action-btn skat-action-secondary',
        type: 'button',
        onClick: () => openScanner(container)
    }, el('span', { className: 'skat-action-icon' }, '⌖'),
       el('span', {}, 'ESCANEAR PARCEIRO')));
    screen.appendChild(actions);

    // Contagem
    screen.appendChild(el('div', { className: 'skat-count' },
        el('span', { className: 'skat-count-num' }, String(crew.length)),
        el('span', { className: 'skat-count-label' }, crew.length === 1 ? 'skatista carimbado' : 'skatistas carimbados')
    ));

    // Galeria
    screen.appendChild(el('h2', { className: 'skat-section-title' }, 'GALERIA'));
    if (crew.length === 0) {
        screen.appendChild(el('p', { className: 'skat-empty' },
            'nenhum skatista ainda. carimba alguém escaneando o QR dele.'
        ));
    } else {
        screen.appendChild(renderGallery(crew, container));
    }

    // Crews
    screen.appendChild(el('h2', { className: 'skat-section-title' }, 'CREWS'));
    screen.appendChild(el('p', { className: 'skat-section-desc' },
        'agrupa skatistas em grupos pessoais (só você vê).'
    ));
    screen.appendChild(renderCrewsSection(crews, crew, container));

    // Editar identidade
    screen.appendChild(el('button', {
        className: 'skat-edit-id-btn',
        type: 'button',
        onClick: () => openEditIdentity(me, container)
    }, 'editar minha assinatura'));

    container.appendChild(screen);
}

function renderMyStamp(me, crewCount) {
    const card = el('div', { className: 'skat-me-card' });
    const stampBox = el('div', { className: 'skat-me-stamp' });
    stampBox.innerHTML = stampSvgFromId(me.id, { size: 140, label: me.nick, withLabel: true });
    card.appendChild(stampBox);

    const info = el('div', { className: 'skat-me-info' });
    info.appendChild(el('h1', { className: 'skat-me-nick' }, me.nick.toUpperCase()));
    const meta = el('div', { className: 'skat-me-meta' });
    if (me.stance) meta.appendChild(el('span', {}, me.stance));
    if (me.city) meta.appendChild(el('span', {}, me.city));
    info.appendChild(meta);
    const pref = el('div', { className: 'skat-me-prefs' });
    if (me.favTrick) pref.appendChild(el('p', {}, el('strong', {}, 'trick: '), me.favTrick));
    if (me.favPro) pref.appendChild(el('p', {}, el('strong', {}, 'pro: '), me.favPro));
    info.appendChild(pref);
    info.appendChild(el('p', { className: 'skat-me-created' },
        `desde ${formatDate(me.created)}`
    ));
    card.appendChild(info);

    return card;
}

function renderGallery(crew, container) {
    const grid = el('div', { className: 'skat-gallery' });
    // ordena por data de carimbo, mais recente primeiro
    const sorted = crew.slice().sort((a, b) =>
        new Date(b.stampedAt).getTime() - new Date(a.stampedAt).getTime()
    );
    sorted.forEach(s => {
        const cell = el('button', {
            className: 'skat-gallery-item',
            type: 'button',
            onClick: () => openSkatistaDetail(s, container)
        });
        const stampWrap = el('div', { className: 'skat-gallery-stamp' });
        stampWrap.innerHTML = stampSvgFromId(s.id, { size: 80 });
        cell.appendChild(stampWrap);
        cell.appendChild(el('div', { className: 'skat-gallery-nick' }, s.nick));
        cell.appendChild(el('div', { className: 'skat-gallery-date' }, formatDate(s.stampedAt)));
        grid.appendChild(cell);
    });
    return grid;
}

function renderCrewsSection(crews, crew, container) {
    const wrap = el('div', { className: 'skat-crews-wrap' });

    const addBtn = el('button', {
        className: 'skat-crew-add-btn',
        type: 'button',
        onClick: () => openCreateCrew(container)
    }, '+ NOVA CREW');
    wrap.appendChild(addBtn);

    if (crews.length === 0) {
        wrap.appendChild(el('p', { className: 'skat-empty-small' }, 'nenhuma crew ainda.'));
        return wrap;
    }

    const list = el('div', { className: 'skat-crews-list' });
    crews.forEach(c => {
        const members = c.memberIds
            .map(id => crew.find(s => s.id === id))
            .filter(Boolean);
        const item = el('div', {
            className: 'skat-crew-item',
            onClick: () => openCrewDetail(c, container)
        });
        item.appendChild(el('div', { className: 'skat-crew-name' }, c.name));
        item.appendChild(el('div', { className: 'skat-crew-count' },
            `${members.length} ${members.length === 1 ? 'skatista' : 'skatistas'}`
        ));
        // miniaturas dos primeiros 4 membros
        const mini = el('div', { className: 'skat-crew-mini' });
        members.slice(0, 4).forEach(m => {
            const s = el('div', { className: 'skat-crew-mini-stamp' });
            s.innerHTML = stampSvgFromId(m.id, { size: 28 });
            mini.appendChild(s);
        });
        item.appendChild(mini);
        list.appendChild(item);
    });
    wrap.appendChild(list);
    return wrap;
}

/* =========================================================
   OVERLAYS
   ========================================================= */

function openOverlay(container, buildContent, opts = {}) {
    const overlay = el('div', {
        className: 'skat-overlay',
        onClick: (e) => { if (e.target === overlay) close(); }
    });
    const card = el('div', { className: 'skat-overlay-card' });
    const close = () => {
        overlay.classList.add('is-closing');
        setTimeout(() => overlay.remove(), 200);
        if (opts.onClose) opts.onClose();
    };
    buildContent(card, close);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey, { once: true });
    return { close, overlay };
}

function openMyQr(me) {
    openOverlay(null, (card, close) => {
        card.appendChild(el('h2', { className: 'skat-overlay-title' }, 'MEU QR'));
        card.appendChild(el('p', { className: 'skat-overlay-desc' },
            'mostra essa tela pro parceiro escanear.'
        ));
        const payload = buildPayload(me);
        const qrWrap = el('div', { className: 'skat-qr-wrap' });
        try {
            qrWrap.innerHTML = generateQrSvg(payload, { size: 280 });
        } catch (err) {
            qrWrap.appendChild(el('p', { className: 'skat-qr-error' },
                'erro ao gerar QR: ' + err.message
            ));
        }
        card.appendChild(qrWrap);

        card.appendChild(el('p', { className: 'skat-qr-nick' }, me.nick.toUpperCase()));

        card.appendChild(el('button', {
            className: 'skat-overlay-close',
            type: 'button',
            onClick: close
        }, 'FECHAR'));
    });
}

function buildPayload(identity) {
    // formato compacto com chaves curtas pra caber no QR
    return JSON.stringify({
        v: SIGNATURE_VERSION,
        n: identity.nick,
        i: identity.id,
        c: identity.created,
        s: identity.stance || '',
        ci: identity.city || '',
        ft: identity.favTrick || '',
        fp: identity.favPro || ''
    });
}

function parsePayload(raw) {
    try {
        const d = JSON.parse(raw);
        if (!d.i || !d.n) return null;
        return {
            id: String(d.i),
            nick: String(d.n).slice(0, 30),
            created: String(d.c || new Date().toISOString()),
            stance: String(d.s || ''),
            city: String(d.ci || ''),
            favTrick: String(d.ft || ''),
            favPro: String(d.fp || '')
        };
    } catch (e) {
        return null;
    }
}

function openScanner(container) {
    const { close } = openOverlay(null, (card, closeFn) => {
        card.classList.add('skat-scanner-card');
        card.appendChild(el('h2', { className: 'skat-overlay-title' }, 'ESCANEAR'));
        card.appendChild(el('p', { className: 'skat-overlay-desc' },
            'aponta a câmera pro QR do parceiro.'
        ));

        // checa se jsQR tá disponível
        if (typeof window.jsQR !== 'function') {
            card.appendChild(el('p', { className: 'skat-scan-error' },
                'o leitor de QR precisa de internet na primeira vez pra carregar. conecta e volta pra cá.'
            ));
            card.appendChild(el('button', {
                className: 'skat-overlay-close',
                type: 'button',
                onClick: closeFn
            }, 'FECHAR'));
            return;
        }

        const videoBox = el('div', { className: 'skat-scan-video-wrap' });
        const video = el('video', {
            className: 'skat-scan-video',
            autoplay: '',
            playsinline: '',
            muted: ''
        });
        const canvas = el('canvas', { style: { display: 'none' } });
        videoBox.appendChild(video);
        videoBox.appendChild(canvas);
        const reticle = el('div', { className: 'skat-scan-reticle' });
        videoBox.appendChild(reticle);
        card.appendChild(videoBox);

        const status = el('p', { className: 'skat-scan-status' }, 'procurando QR...');
        card.appendChild(status);

        card.appendChild(el('button', {
            className: 'skat-overlay-close',
            type: 'button',
            onClick: () => { stop(); closeFn(); }
        }, 'CANCELAR'));

        let stream;
        let rafId;
        let stopped = false;

        const stop = () => {
            stopped = true;
            if (rafId) cancelAnimationFrame(rafId);
            if (stream) stream.getTracks().forEach(t => t.stop());
        };

        async function start() {
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment' }
                });
                video.srcObject = stream;
                await video.play();
                scan();
            } catch (err) {
                status.textContent = 'sem acesso à câmera: ' + (err.message || err.name);
                status.classList.add('is-error');
            }
        }

        function scan() {
            if (stopped) return;
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0);
                const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
                if (code && code.data) {
                    handleScanned(code.data);
                    return;
                }
            }
            rafId = requestAnimationFrame(scan);
        }

        function handleScanned(data) {
            const parsed = parsePayload(data);
            if (!parsed) {
                status.textContent = 'QR inválido. tenta outro.';
                status.classList.add('is-error');
                rafId = requestAnimationFrame(scan);
                return;
            }
            const me = getMyIdentity();
            if (me && parsed.id === me.id) {
                status.textContent = 'esse é você! :)';
                status.classList.add('is-error');
                setTimeout(() => { status.classList.remove('is-error'); scan(); }, 1500);
                return;
            }
            const added = addToCrew(parsed);
            stop();
            if (added) {
                showCarimbouAnimation(parsed, () => {
                    closeFn();
                    // re-render main
                    const appRoot = document.getElementById('screen-container');
                    if (appRoot) renderMain(appRoot);
                });
            } else {
                status.textContent = `${parsed.nick} já foi carimbado antes`;
                status.classList.add('is-error');
                setTimeout(closeFn, 1500);
            }
        }

        start();
    });
}

function showCarimbouAnimation(skatista, onDone) {
    const overlay = el('div', { className: 'skat-carimbou-overlay' });
    const stampBox = el('div', { className: 'skat-carimbou-stamp' });
    stampBox.innerHTML = stampSvgFromId(skatista.id, { size: 200, label: skatista.nick, withLabel: true });
    overlay.appendChild(stampBox);
    overlay.appendChild(el('h1', { className: 'skat-carimbou-title' }, 'CARIMBOU!'));
    overlay.appendChild(el('p', { className: 'skat-carimbou-nick' }, skatista.nick));
    document.body.appendChild(overlay);
    sfx.stamp();
    setTimeout(() => {
        overlay.classList.add('is-leaving');
        setTimeout(() => {
            overlay.remove();
            if (onDone) onDone();
        }, 400);
    }, 1800);
}

function openSkatistaDetail(skatista, container) {
    openOverlay(null, (card, close) => {
        card.appendChild(el('h2', { className: 'skat-overlay-title' }, skatista.nick.toUpperCase()));
        const sb = el('div', { className: 'skat-detail-stamp' });
        sb.innerHTML = stampSvgFromId(skatista.id, { size: 160, label: skatista.nick, withLabel: true });
        card.appendChild(sb);
        const info = el('div', { className: 'skat-detail-info' });
        if (skatista.stance) info.appendChild(el('p', {}, el('strong', {}, 'stance: '), skatista.stance));
        if (skatista.city) info.appendChild(el('p', {}, el('strong', {}, 'cidade: '), skatista.city));
        if (skatista.favTrick) info.appendChild(el('p', {}, el('strong', {}, 'trick: '), skatista.favTrick));
        if (skatista.favPro) info.appendChild(el('p', {}, el('strong', {}, 'pro: '), skatista.favPro));
        info.appendChild(el('p', { className: 'skat-detail-meta' },
            `carimbado em ${formatDate(skatista.stampedAt)}`
        ));
        card.appendChild(info);

        card.appendChild(el('button', {
            className: 'skat-secondary-btn',
            type: 'button',
            onClick: () => {
                if (!confirm(`remover ${skatista.nick} da galeria?`)) return;
                removeFromCrew(skatista.id);
                close();
                renderMain(container);
            }
        }, 'REMOVER'));

        card.appendChild(el('button', {
            className: 'skat-overlay-close',
            type: 'button',
            onClick: close
        }, 'FECHAR'));
    });
}

function openCreateCrew(container) {
    openOverlay(null, (card, close) => {
        card.appendChild(el('h2', { className: 'skat-overlay-title' }, 'NOVA CREW'));
        const input = el('input', {
            className: 'skat-input',
            type: 'text',
            maxlength: '40',
            placeholder: 'ex: manos do centro'
        });
        card.appendChild(input);
        card.appendChild(el('button', {
            className: 'skat-primary-btn',
            type: 'button',
            onClick: () => {
                const name = input.value.trim();
                if (!name) return;
                createCrew(name);
                close();
                renderMain(container);
            }
        }, 'CRIAR'));
        card.appendChild(el('button', {
            className: 'skat-overlay-close',
            type: 'button',
            onClick: close
        }, 'CANCELAR'));
        setTimeout(() => input.focus(), 100);
    });
}

function openCrewDetail(crewItem, container) {
    const crew = getCrew();
    openOverlay(null, (card, close) => {
        card.appendChild(el('h2', { className: 'skat-overlay-title' }, crewItem.name));
        card.appendChild(el('p', { className: 'skat-overlay-desc' },
            'toca pra adicionar/remover da crew.'
        ));
        if (crew.length === 0) {
            card.appendChild(el('p', { className: 'skat-empty' },
                'carimba alguns skatistas antes de montar a crew.'
            ));
        } else {
            const list = el('div', { className: 'skat-crew-toggles' });
            crew.forEach(s => {
                const isMember = crewItem.memberIds.includes(s.id);
                const toggle = el('button', {
                    className: `skat-crew-toggle${isMember ? ' is-on' : ''}`,
                    type: 'button',
                    onClick: () => {
                        const updated = toggleCrewMember(crewItem.id, s.id);
                        if (updated) {
                            crewItem.memberIds = updated.memberIds;
                            toggle.classList.toggle('is-on', updated.memberIds.includes(s.id));
                        }
                    }
                });
                const st = el('div', { className: 'skat-crew-toggle-stamp' });
                st.innerHTML = stampSvgFromId(s.id, { size: 36 });
                toggle.appendChild(st);
                toggle.appendChild(el('span', {}, s.nick));
                list.appendChild(toggle);
            });
            card.appendChild(list);
        }
        card.appendChild(el('button', {
            className: 'skat-secondary-btn',
            type: 'button',
            onClick: () => {
                if (!confirm(`apagar a crew "${crewItem.name}"?`)) return;
                deleteCrew(crewItem.id);
                close();
                renderMain(container);
            }
        }, 'APAGAR CREW'));
        card.appendChild(el('button', {
            className: 'skat-overlay-close',
            type: 'button',
            onClick: () => { close(); renderMain(container); }
        }, 'OK'));
    });
}

function openEditIdentity(me, container) {
    openOverlay(null, (card, close) => {
        card.appendChild(el('h2', { className: 'skat-overlay-title' }, 'EDITAR ASSINATURA'));
        card.appendChild(el('p', { className: 'skat-overlay-desc' },
            'seu carimbo não muda (UUID fixo). só os detalhes em volta.'
        ));
        const fields = [
            { key: 'nick', label: 'nick', max: 30 },
            { key: 'stance', label: 'stance (regular/goofy)', max: 20 },
            { key: 'city', label: 'cidade', max: 40 },
            { key: 'favTrick', label: 'trick favorita', max: 40 },
            { key: 'favPro', label: 'skatista pro favorito', max: 40 }
        ];
        const inputs = {};
        fields.forEach(f => {
            const row = el('div', { className: 'skat-form-row' });
            row.appendChild(el('label', { className: 'skat-form-label' }, f.label));
            const inp = el('input', {
                className: 'skat-input',
                type: 'text',
                maxlength: String(f.max),
                value: me[f.key] || ''
            });
            inputs[f.key] = inp;
            row.appendChild(inp);
            card.appendChild(row);
        });
        card.appendChild(el('button', {
            className: 'skat-primary-btn',
            type: 'button',
            onClick: () => {
                const updated = { ...me };
                for (const f of fields) {
                    updated[f.key] = inputs[f.key].value.trim();
                }
                if (!updated.nick) {
                    alert('nick não pode ficar vazio');
                    return;
                }
                setMyIdentity(updated);
                close();
                renderMain(container);
            }
        }, 'SALVAR'));
        card.appendChild(el('button', {
            className: 'skat-overlay-close',
            type: 'button',
            onClick: close
        }, 'CANCELAR'));
    });
}

/* =========================================================
   HELPERS
   ========================================================= */

function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export default { render };
