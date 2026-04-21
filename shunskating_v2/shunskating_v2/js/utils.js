/**
 * utils.js
 * Helpers reutilizáveis.
 */

/** Cria elemento DOM com atributos e filhos. Retorna o elemento. */
export function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'className') node.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.startsWith('on') && typeof v === 'function') {
            node.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (k === 'dataset' && typeof v === 'object') {
            Object.assign(node.dataset, v);
        } else if (k === 'html') {
            // só usar html explicitamente quando o conteúdo é confiável (nosso próprio JSON)
            node.innerHTML = v;
        } else {
            node.setAttribute(k, v);
        }
    }
    for (const c of children.flat()) {
        if (c == null || c === false) continue;
        node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
}

/** Escape HTML (para quando precisamos mostrar input do usuário como texto). */
export function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Debounce. */
export function debounce(fn, wait = 300) {
    let t;
    return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
    };
}

/** Escolhe aleatório de array. */
export function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/** Normaliza string para busca (lowercase, remove acentos). */
export function norm(str) {
    return String(str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

/** Feedback visual de flash em elemento (clique). */
export function flash(element) {
    element.classList.remove('flash-active');
    void element.offsetWidth;
    element.classList.add('flash-active');
    setTimeout(() => element.classList.remove('flash-active'), 100);
}

/** Fetch de JSON estático. */
export async function fetchJson(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Falha ao carregar ${path}: ${res.status}`);
    return await res.json();
}

/** Nome bonito do stance. */
export function stanceLabel(stance) {
    const labels = {
        regular: 'Regular',
        switch:  'Switch',
        fakie:   'Fakie',
        nollie:  'Nollie'
    };
    return labels[stance] || stance;
}

/** Nome bonito do nível. */
export function levelLabel(level) {
    const labels = [
        'não tentei',
        'tentei',
        'caí mas landei',
        'landei limpo',
        'consistente',
        'dominado'
    ];
    return labels[level] || '';
}
