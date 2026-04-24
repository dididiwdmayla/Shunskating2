/**
 * stamp-gen.js
 *
 * Gera um "carimbo" SVG deterministicamente a partir de um UUID (ou qualquer string).
 * Mesma string = mesmo carimbo, sempre. Isso é essencial pra identidade persistente.
 *
 * Componentes derivados do hash:
 *   - Forma da borda (6 opções)
 *   - Cor principal (8 opções do tema zine)
 *   - Rotação leve (-10° a +10°)
 *   - Ornamento central (10 opções)
 *   - Textura de fundo (4 opções)
 *   - Cor do ornamento (contraste com a principal)
 *
 * Total aproximado: 6 × 8 × 20 × 10 × 4 = 38.400 combinações visuais distintas.
 */

/** Hash FNV-1a simples e determinístico — não criptográfico, mas consistente. */
function hashString(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    // Converte pra unsigned 32-bit
    return h >>> 0;
}

/** Gera N bytes pseudo-aleatórios mas determinísticos a partir de uma seed. */
function seededBytes(seed, count) {
    const bytes = new Array(count);
    let state = seed;
    for (let i = 0; i < count; i++) {
        // Xorshift32
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        state = state >>> 0;
        bytes[i] = state & 0xff;
    }
    return bytes;
}

/* Paletas e ornamentos */

const STAMP_COLORS = [
    '#c8201f', // thrasher red
    '#0a0a0a', // preto
    '#2a4d3a', // verde fosco
    '#4a3a28', // marrom
    '#7a2a4a', // vinho
    '#b85c1f', // laranja queimado
    '#1f3a6e', // azul marinho
    '#5a3a7a'  // roxo escuro
];

const STAMP_SHAPES = ['circle', 'square', 'hex', 'oval', 'shield', 'diamond'];

const STAMP_ORNAMENTS = [
    '★', '✗', '●', '◆', '♠', '☠', '⚡', '♡', '⚑', '✚'
];

const STAMP_TEXTURES = ['solid', 'lines-h', 'lines-d', 'dots'];

/** Gera dados do carimbo (sem SVG ainda). Útil pra serializar se quiser. */
export function stampDataFromId(id) {
    const seed = hashString(String(id || 'anon'));
    const bytes = seededBytes(seed, 8);
    const shape = STAMP_SHAPES[bytes[0] % STAMP_SHAPES.length];
    const color = STAMP_COLORS[bytes[1] % STAMP_COLORS.length];
    // rotação -10 a +10
    const rotation = ((bytes[2] % 21) - 10);
    const ornament = STAMP_ORNAMENTS[bytes[3] % STAMP_ORNAMENTS.length];
    const texture = STAMP_TEXTURES[bytes[4] % STAMP_TEXTURES.length];
    // cor de ornamento: fica sempre preto ou branco pra contraste forte
    const ornamentColor = bytes[5] % 2 === 0 ? '#0a0a0a' : '#fefefe';
    return { shape, color, rotation, ornament, texture, ornamentColor };
}

/**
 * Gera SVG do carimbo.
 *
 * @param {string} id — UUID ou string qualquer (determinístico)
 * @param {object} opts — { size: 120, label: 'pikyl', withLabel: true }
 * @returns {string} SVG completo
 */
export function stampSvgFromId(id, opts = {}) {
    const {
        size = 120,
        label = '',
        withLabel = false,
        faded = false // se true, reduz saturação e adiciona manchas (parece carimbo molhado no papel)
    } = opts;

    const data = stampDataFromId(id);
    const { shape, color, rotation, ornament, texture, ornamentColor } = data;

    // svg viewBox padronizado em 100x100
    const vb = 100;
    const center = vb / 2;

    // Define clipPath pra textura caber dentro da forma
    const clipId = `stamp-clip-${hashString(String(id)).toString(16)}`;
    const shapePath = buildShapePath(shape, vb);

    // Textura
    let textureLayer = '';
    if (texture === 'lines-h') {
        textureLayer = `
            <g clip-path="url(#${clipId})" opacity="0.25">
                ${Array.from({ length: 20 }, (_, i) =>
                    `<line x1="0" y1="${i * 5}" x2="${vb}" y2="${i * 5}" stroke="${ornamentColor}" stroke-width="0.7"/>`
                ).join('')}
            </g>`;
    } else if (texture === 'lines-d') {
        textureLayer = `
            <g clip-path="url(#${clipId})" opacity="0.22">
                ${Array.from({ length: 30 }, (_, i) =>
                    `<line x1="${-vb + i * 7}" y1="0" x2="${i * 7}" y2="${vb}" stroke="${ornamentColor}" stroke-width="0.6"/>`
                ).join('')}
            </g>`;
    } else if (texture === 'dots') {
        let dots = '';
        for (let y = 4; y < vb; y += 7) {
            for (let x = 4 + (y % 14 === 0 ? 0 : 3.5); x < vb; x += 7) {
                dots += `<circle cx="${x}" cy="${y}" r="0.9" fill="${ornamentColor}" opacity="0.35"/>`;
            }
        }
        textureLayer = `<g clip-path="url(#${clipId})">${dots}</g>`;
    }

    // Pontos de "gasto" (manchas aleatórias que simulam carimbo imperfeito)
    const wearSeed = seededBytes(hashString(String(id)) + 13, 20);
    let wearLayer = '';
    for (let i = 0; i < 8; i++) {
        const wx = (wearSeed[i] % 80) + 10;
        const wy = (wearSeed[i + 8] % 80) + 10;
        const wr = (wearSeed[i] % 3) + 0.5;
        wearLayer += `<circle cx="${wx}" cy="${wy}" r="${wr}" fill="${color}" opacity="0.25"/>`;
    }

    // Label pequeno em cima, se solicitado
    const labelY = shape === 'shield' ? 18 : 22;
    const labelTxt = label ? label.slice(0, 10).toUpperCase() : '';
    const labelElem = withLabel && labelTxt
        ? `<text x="${center}" y="${labelY}" text-anchor="middle" font-family="Anton, Impact, sans-serif" font-size="11" fill="${color}" letter-spacing="0.5">${escapeXml(labelTxt)}</text>`
        : '';

    // Ornamento central (um pouco abaixo do centro se tem label em cima)
    const ornY = withLabel && labelTxt ? center + 8 : center + 4;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vb} ${vb}" width="${size}" height="${size}" style="transform: rotate(${rotation}deg); ${faded ? 'filter: saturate(0.7) opacity(0.85);' : ''}">
        <defs>
            <clipPath id="${clipId}">
                ${shapePath.replace('STROKE', 'none').replace('FILL', 'black')}
            </clipPath>
        </defs>
        <g>
            ${shapePath.replace('STROKE', color).replace('FILL', 'none').replace('stroke-width="X"', 'stroke-width="3"')}
            ${textureLayer}
            ${wearLayer}
            ${labelElem}
            <text x="${center}" y="${ornY}" text-anchor="middle" dominant-baseline="middle" font-family="Anton, Impact, sans-serif" font-size="36" fill="${color}">${escapeXml(ornament)}</text>
        </g>
    </svg>`;

    return svg;
}

function buildShapePath(shape, vb) {
    const c = vb / 2;
    switch (shape) {
        case 'circle':
            return `<circle cx="${c}" cy="${c}" r="${c - 5}" stroke="STROKE" stroke-width="X" fill="FILL"/>`;
        case 'square':
            return `<rect x="8" y="8" width="${vb - 16}" height="${vb - 16}" stroke="STROKE" stroke-width="X" fill="FILL"/>`;
        case 'hex': {
            const pts = [];
            for (let i = 0; i < 6; i++) {
                const a = (Math.PI / 3) * i - Math.PI / 2;
                pts.push(`${(c + Math.cos(a) * (c - 6)).toFixed(1)},${(c + Math.sin(a) * (c - 6)).toFixed(1)}`);
            }
            return `<polygon points="${pts.join(' ')}" stroke="STROKE" stroke-width="X" fill="FILL"/>`;
        }
        case 'oval':
            return `<ellipse cx="${c}" cy="${c}" rx="${c - 4}" ry="${c - 12}" stroke="STROKE" stroke-width="X" fill="FILL"/>`;
        case 'shield':
            return `<path d="M ${c} 8 L ${vb - 12} 20 L ${vb - 12} ${vb - 30} Q ${vb - 12} ${vb - 8} ${c} ${vb - 8} Q 12 ${vb - 8} 12 ${vb - 30} L 12 20 Z" stroke="STROKE" stroke-width="X" fill="FILL"/>`;
        case 'diamond':
            return `<polygon points="${c},6 ${vb - 6},${c} ${c},${vb - 6} 6,${c}" stroke="STROKE" stroke-width="X" fill="FILL"/>`;
        default:
            return `<circle cx="${c}" cy="${c}" r="${c - 5}" stroke="STROKE" stroke-width="X" fill="FILL"/>`;
    }
}

function escapeXml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/** Insere o SVG num container DOM. */
export function renderStampInto(container, id, opts) {
    container.innerHTML = stampSvgFromId(id, opts);
}
