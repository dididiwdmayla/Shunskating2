/**
 * navigation.js
 * Roteador simples. Troca de tela via pushState.
 * Cada tela é um módulo com export default { render(container, params) }.
 */

const screens = new Map();
let currentScreen = null;
let currentParams = null;

/** Registra uma tela sob um id. */
export function registerScreen(id, screenModule) {
    screens.set(id, screenModule);
}

/** Navega para uma tela. Atualiza URL, renderiza, anima entrada. */
export function navigate(screenId, params = {}, options = {}) {
    const screen = screens.get(screenId);
    if (!screen) {
        console.warn('[navigation] tela não registrada:', screenId);
        return;
    }

    // atualiza history
    if (!options.replace) {
        const url = buildUrl(screenId, params);
        history.pushState({ screenId, params }, '', url);
    }

    render(screenId, params);
}

/** Renderiza tela no container. */
function render(screenId, params) {
    const screen = screens.get(screenId);
    const container = document.getElementById('app');
    if (!container || !screen) return;

    // anima saída da tela anterior (se houver)
    const prev = container.firstElementChild;
    if (prev) prev.classList.add('anim-cut-out');

    // timeout mínimo pra animação iniciar, senão troca instantânea
    setTimeout(() => {
        container.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'screen-wrapper anim-cut-in';
        container.appendChild(wrapper);

        screen.render(wrapper, params);

        currentScreen = screenId;
        currentParams = params;

        // scroll pro topo em troca de tela
        window.scrollTo(0, 0);

        // atualiza página marker
        updatePageMarker(screenId);

        // atualiza botton nav ativo
        updateNavActive(screenId);
    }, prev ? 120 : 0);
}

/** Monta URL para o history. Usa hash para evitar 404 em refresh. */
function buildUrl(screenId, params) {
    const base = `#/${screenId}`;
    if (!params || Object.keys(params).length === 0) return base;
    const query = Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
    return `${base}?${query}`;
}

/** Parse da URL atual para screen + params. */
export function parseUrl() {
    const hash = window.location.hash || '#/home';
    const [path, query] = hash.replace(/^#\//, '').split('?');
    const params = {};
    if (query) {
        query.split('&').forEach((pair) => {
            const [k, v] = pair.split('=');
            params[decodeURIComponent(k)] = decodeURIComponent(v || '');
        });
    }
    return { screenId: path || 'home', params };
}

/** Atualiza o marcador de página no canto. */
function updatePageMarker(screenId) {
    const marker = document.getElementById('page-marker');
    if (!marker) return;
    const labels = {
        home:        '// pg. 01 //',
        tricks:      '// pg. 02 //',
        trickDetail: '// pg. 02b //',
        game:        '// pg. 03 //',
        metas:       '// pg. 04 //',
        dicas:       '// pg. 05 //'
    };
    marker.textContent = labels[screenId] || `// ${screenId} //`;
}

/** Atualiza qual item do bottom nav está ativo. */
function updateNavActive(screenId) {
    const nav = document.getElementById('bottom-nav');
    if (!nav) return;
    // screens que compartilham "pai" na nav
    const parent = {
        trickDetail: 'tricks'
    };
    const activeId = parent[screenId] || screenId;
    nav.querySelectorAll('.nav-item').forEach((el) => {
        el.classList.toggle('is-active', el.dataset.screen === activeId);
    });
}

/** Getters. */
export function getCurrentScreen() {
    return currentScreen;
}

export function getCurrentParams() {
    return currentParams;
}

/** Bootstrap — chamado pelo app.js depois de registrar as telas. */
export function start() {
    // back/forward do navegador
    window.addEventListener('popstate', (e) => {
        if (e.state && e.state.screenId) {
            render(e.state.screenId, e.state.params || {});
        } else {
            const { screenId, params } = parseUrl();
            render(screenId, params);
        }
    });

    // renderiza tela inicial a partir da URL
    const { screenId, params } = parseUrl();
    render(screenId, params);
}
