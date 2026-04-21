/**
 * screens/dicas.js
 *
 * Tela de DICAS — accordion de seções colapsáveis com conteúdo HTML
 * rico. Cada seção é independente e pode ser expandida/colapsada.
 *
 * O estado de expansão fica em localStorage — assim quando você volta
 * pra tela, a seção que tava aberta continua aberta.
 */

import { el, fetchJson } from '../utils.js';
import { get, set } from '../storage.js';

const EXPANDED_KEY = 'shun_v2.dicasExpanded'; // { [sectionId]: true }
let dicasData = null;

async function loadDicas() {
    if (dicasData) return dicasData;
    try {
        dicasData = await fetchJson('data/dicas.json');
    } catch (err) {
        console.error('[dicas] falha ao carregar dicas.json', err);
        dicasData = { sections: [] };
    }
    return dicasData;
}

function getExpanded() {
    return get(EXPANDED_KEY, {});
}

function setExpanded(sectionId, isOpen) {
    const all = getExpanded();
    if (isOpen) all[sectionId] = true;
    else delete all[sectionId];
    set(EXPANDED_KEY, all);
}

/* =========================================================
   RENDER PRINCIPAL
   ========================================================= */

async function render(container) {
    const data = await loadDicas();

    const screen = el('div', { className: 'screen-dicas' });

    /* --- HEADER --- */
    screen.appendChild(el('h1', { className: 'dicas-title xerox-tremor' }, 'DICAS'));
    screen.appendChild(el('p', { className: 'dicas-subtitle' },
        'Fundamentos, hacks mentais e filosofia. ',
        el('em', {}, 'Escolha uma seção.')
    ));

    /* --- ACCORDION --- */
    const accordion = el('div', { className: 'dicas-accordion' });
    const expanded = getExpanded();

    data.sections.forEach(section => {
        accordion.appendChild(renderSection(section, !!expanded[section.id]));
    });

    screen.appendChild(accordion);

    /* --- FOOTER DE FECHO --- */
    screen.appendChild(el('p', { className: 'dicas-footer' },
        '瞬 · ',
        el('em', {}, 'o instante é tudo')
    ));

    container.appendChild(screen);
}

/* =========================================================
   RENDER DE UMA SEÇÃO
   ========================================================= */

function renderSection(section, isOpen) {
    const wrapper = el('div', {
        className: `dicas-section${isOpen ? ' is-open' : ''}`,
        dataset: { sectionId: section.id }
    });

    // wrapper de conteúdo (criado cedo pra poder passar pra função toggle)
    const contentWrapper = el('div', {
        className: 'dicas-section-content',
        id: `dicas-content-${section.id}`,
        role: 'region'
    });

    // header clicável
    const header = el('button', {
        className: 'dicas-section-header',
        type: 'button',
        'aria-expanded': isOpen ? 'true' : 'false',
        'aria-controls': `dicas-content-${section.id}`,
        onClick: (e) => toggleSection(wrapper, section.id, contentWrapper, e.currentTarget)
    },
        el('span', { className: 'dicas-section-icon', 'aria-hidden': 'true' }, section.icon),
        el('div', { className: 'dicas-section-text' },
            el('h2', { className: 'dicas-section-heading' }, section.title),
            el('p', { className: 'dicas-section-summary' }, section.summary)
        ),
        el('span', { className: 'dicas-section-chevron', 'aria-hidden': 'true' }, '▸')
    );
    wrapper.appendChild(header);

    // popula conteúdo só se a seção começa aberta (lazy load)
    if (isOpen) {
        renderContentInto(contentWrapper, section);
    }

    wrapper.appendChild(contentWrapper);

    return wrapper;
}

function renderContentInto(contentWrapper, section) {
    if (contentWrapper.dataset.loaded === '1') return;

    const article = el('article', {
        className: 'dicas-article',
        html: section.content
    });

    // envolve tabelas em scroll container (mesmo padrão do trick-detail)
    wrapTablesForScroll(article);

    contentWrapper.innerHTML = '';
    contentWrapper.appendChild(article);
    contentWrapper.dataset.loaded = '1';
}

function toggleSection(wrapper, sectionId, contentWrapper, headerBtn) {
    const isOpen = wrapper.classList.toggle('is-open');

    headerBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    setExpanded(sectionId, isOpen);

    if (isOpen) {
        // carrega conteúdo se ainda não foi carregado (lazy)
        const section = dicasData.sections.find(s => s.id === sectionId);
        if (section) renderContentInto(contentWrapper, section);

        // scroll suave do header pro topo da viewport com delay pra animação
        setTimeout(() => {
            headerBtn.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 180);
    }
}

/* =========================================================
   HELPERS
   ========================================================= */

function wrapTablesForScroll(contentEl) {
    contentEl.querySelectorAll('table').forEach((table) => {
        if (table.parentElement && table.parentElement.classList.contains('table-scroll')) return;
        const wrapper = document.createElement('div');
        wrapper.className = 'table-scroll';
        wrapper.setAttribute('role', 'region');
        wrapper.setAttribute('aria-label', 'Tabela com rolagem horizontal');
        wrapper.tabIndex = 0;
        table.parentNode.insertBefore(wrapper, table);
        wrapper.appendChild(table);
    });
}

export default { render };
