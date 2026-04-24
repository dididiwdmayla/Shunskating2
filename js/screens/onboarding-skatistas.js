/**
 * screens/onboarding-skatistas.js
 *
 * 4 telas de onboarding pra criar a assinatura:
 *   1. Boas-vindas
 *   2. Dados básicos (nick, stance, city)
 *   3. Dados de estilo (favTrick, favPro)
 *   4. Revelação do carimbo com animação
 */

import { el, fetchJson } from '../utils.js';
import { setMyIdentity, markOnboardingSkatistasDone } from '../storage.js';
import { stampSvgFromId } from '../stamp-gen.js';

async function render(container, params = {}) {
    const onDone = params.onDone || (() => {});
    const draft = {
        nick: '',
        stance: '',
        city: '',
        favTrick: '',
        favPro: ''
    };

    let tricksData = null;
    try {
        tricksData = await fetchJson('data/tricks.json');
    } catch (e) {}

    renderStep1(container, draft, onDone, tricksData);
}

function renderStep1(container, draft, onDone, tricksData) {
    container.innerHTML = '';
    const screen = el('div', { className: 'screen-onboarding-skat screen-skat-step-1' });
    screen.appendChild(el('div', { className: 'skat-ob-step' }, '1 / 4'));
    screen.appendChild(el('h1', { className: 'skat-ob-title xerox-tremor' }, 'SKATISTAS'));
    screen.appendChild(el('p', { className: 'skat-ob-big-text' },
        'você está prestes a criar sua ',
        el('strong', {}, 'assinatura'),
        '. ela é sua identidade única — fica só no seu celular, funciona sem internet.'
    ));
    screen.appendChild(el('p', { className: 'skat-ob-body' },
        'quando você encontrar outros skatistas, cada um mostra o QR do outro e ',
        el('strong', {}, 'carimba'),
        '. junta quem você conheceu, monta crews, guarda a história.'
    ));
    screen.appendChild(el('button', {
        className: 'skat-ob-primary',
        type: 'button',
        onClick: () => renderStep2(container, draft, onDone, tricksData)
    }, 'COMEÇAR →'));
    container.appendChild(screen);
}

function renderStep2(container, draft, onDone, tricksData) {
    container.innerHTML = '';
    const screen = el('div', { className: 'screen-onboarding-skat screen-skat-step-2' });
    screen.appendChild(el('div', { className: 'skat-ob-step' }, '2 / 4'));
    screen.appendChild(el('h2', { className: 'skat-ob-subtitle' }, 'QUEM É VOCÊ?'));

    const form = el('div', { className: 'skat-ob-form' });

    // Nick
    form.appendChild(el('label', { className: 'skat-ob-label' }, 'seu nick / apelido'));
    const nickInp = el('input', {
        className: 'skat-ob-input',
        type: 'text',
        maxlength: '30',
        placeholder: 'ex: pikyl',
        value: draft.nick
    });
    form.appendChild(nickInp);

    // Stance
    form.appendChild(el('label', { className: 'skat-ob-label' }, 'stance'));
    const stanceRow = el('div', { className: 'skat-ob-stance-row' });
    ['regular', 'goofy'].forEach(s => {
        const btn = el('button', {
            className: `skat-ob-stance-btn${draft.stance === s ? ' is-active' : ''}`,
            type: 'button',
            onClick: () => {
                draft.stance = s;
                stanceRow.querySelectorAll('.skat-ob-stance-btn').forEach(b =>
                    b.classList.toggle('is-active', b.dataset.stance === s)
                );
            },
            dataset: { stance: s }
        }, s.toUpperCase());
        stanceRow.appendChild(btn);
    });
    form.appendChild(stanceRow);

    // City
    form.appendChild(el('label', { className: 'skat-ob-label' }, 'cidade (opcional)'));
    const cityInp = el('input', {
        className: 'skat-ob-input',
        type: 'text',
        maxlength: '40',
        placeholder: 'ex: Sarandi',
        value: draft.city
    });
    form.appendChild(cityInp);

    screen.appendChild(form);

    const nav = el('div', { className: 'skat-ob-nav' });
    nav.appendChild(el('button', {
        className: 'skat-ob-back',
        type: 'button',
        onClick: () => renderStep1(container, draft, onDone, tricksData)
    }, '← VOLTAR'));
    nav.appendChild(el('button', {
        className: 'skat-ob-primary',
        type: 'button',
        onClick: () => {
            draft.nick = nickInp.value.trim();
            draft.city = cityInp.value.trim();
            if (!draft.nick) {
                alert('precisa de um nick pra continuar');
                return;
            }
            renderStep3(container, draft, onDone, tricksData);
        }
    }, 'PRÓXIMO →'));
    screen.appendChild(nav);

    container.appendChild(screen);
    setTimeout(() => nickInp.focus(), 100);
}

function renderStep3(container, draft, onDone, tricksData) {
    container.innerHTML = '';
    const screen = el('div', { className: 'screen-onboarding-skat screen-skat-step-3' });
    screen.appendChild(el('div', { className: 'skat-ob-step' }, '3 / 4'));
    screen.appendChild(el('h2', { className: 'skat-ob-subtitle' }, 'ESTILO'));
    screen.appendChild(el('p', { className: 'skat-ob-body' },
        'duas coisas que dizem o que você curte.'
    ));

    const form = el('div', { className: 'skat-ob-form' });

    // Fav trick (picker + livre)
    form.appendChild(el('label', { className: 'skat-ob-label' }, 'trick favorita'));
    if (tricksData && tricksData.tricks) {
        const chips = el('div', { className: 'skat-ob-chips' });
        tricksData.tricks.forEach(t => {
            const chip = el('button', {
                className: `skat-ob-chip${draft.favTrick === t.name ? ' is-active' : ''}`,
                type: 'button',
                dataset: { name: t.name },
                onClick: () => {
                    draft.favTrick = t.name;
                    trickInp.value = t.name;
                    chips.querySelectorAll('.skat-ob-chip').forEach(c =>
                        c.classList.toggle('is-active', c.dataset.name === t.name)
                    );
                }
            }, t.name);
            chips.appendChild(chip);
        });
        form.appendChild(chips);
    }
    const trickInp = el('input', {
        className: 'skat-ob-input',
        type: 'text',
        maxlength: '40',
        placeholder: 'ou escreve outra',
        value: draft.favTrick
    });
    form.appendChild(trickInp);

    // Fav pro
    form.appendChild(el('label', { className: 'skat-ob-label' }, 'skatista pro favorito'));
    const proInp = el('input', {
        className: 'skat-ob-input',
        type: 'text',
        maxlength: '40',
        placeholder: 'ex: Daewon Song',
        value: draft.favPro
    });
    form.appendChild(proInp);

    screen.appendChild(form);

    const nav = el('div', { className: 'skat-ob-nav' });
    nav.appendChild(el('button', {
        className: 'skat-ob-back',
        type: 'button',
        onClick: () => renderStep2(container, draft, onDone, tricksData)
    }, '← VOLTAR'));
    nav.appendChild(el('button', {
        className: 'skat-ob-primary',
        type: 'button',
        onClick: () => {
            draft.favTrick = trickInp.value.trim();
            draft.favPro = proInp.value.trim();
            renderStep4(container, draft, onDone);
        }
    }, 'GERAR CARIMBO →'));
    screen.appendChild(nav);

    container.appendChild(screen);
}

function renderStep4(container, draft, onDone) {
    container.innerHTML = '';
    // finaliza identidade
    const id = generateUuid();
    const identity = {
        nick: draft.nick,
        id,
        created: new Date().toISOString(),
        stance: draft.stance,
        city: draft.city,
        favTrick: draft.favTrick,
        favPro: draft.favPro
    };

    const screen = el('div', { className: 'screen-onboarding-skat screen-skat-step-4' });
    screen.appendChild(el('div', { className: 'skat-ob-step' }, '4 / 4'));
    screen.appendChild(el('h2', { className: 'skat-ob-subtitle' }, 'SEU CARIMBO'));
    screen.appendChild(el('p', { className: 'skat-ob-body' },
        'único no mundo. ninguém mais tem outro igual.'
    ));

    const reveal = el('div', { className: 'skat-ob-reveal' });
    const stampBox = el('div', { className: 'skat-ob-stamp-box' });
    stampBox.innerHTML = stampSvgFromId(identity.id, { size: 200, label: identity.nick, withLabel: true });
    reveal.appendChild(stampBox);
    screen.appendChild(reveal);

    const info = el('div', { className: 'skat-ob-final-info' });
    info.appendChild(el('p', { className: 'skat-ob-final-nick' }, identity.nick.toUpperCase()));
    const meta = [];
    if (identity.stance) meta.push(identity.stance);
    if (identity.city) meta.push(identity.city);
    if (meta.length) info.appendChild(el('p', { className: 'skat-ob-final-meta' }, meta.join(' · ')));
    screen.appendChild(info);

    screen.appendChild(el('button', {
        className: 'skat-ob-primary skat-ob-final-btn',
        type: 'button',
        onClick: () => {
            setMyIdentity(identity);
            markOnboardingSkatistasDone();
            onDone();
        }
    }, 'PRONTO, É MEU'));

    container.appendChild(screen);

    // trigger animação de stamp descendo (via classe)
    requestAnimationFrame(() => {
        stampBox.classList.add('is-stamping');
    });
}

function generateUuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // fallback
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export default { render };
