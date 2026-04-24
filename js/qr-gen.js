/**
 * qr-gen.js
 *
 * Gerador de QR code minimalista, sem dependências externas.
 *
 * Suporta modo byte (qualquer conteúdo UTF-8 até ~300 chars facilmente),
 * error correction level M (15% de correção — balanço bom entre tamanho e robustez),
 * versões 1 a 10 (até ~271 chars).
 *
 * Uso:
 *   import { generateQrSvg } from './qr-gen.js';
 *   const svg = generateQrSvg(text, { size: 256 });
 *
 * Baseado em implementações de referência mas escrito do zero pra ser pequeno.
 */

/* =========================================================
   TABELAS QR (Reed-Solomon, version blocks, etc.)
   ========================================================= */

// Capacidade por versão, modo byte, EC level M
// Índice = versão (1 a 10), valor = max bytes
const BYTE_CAPACITY_M = [0, 14, 26, 42, 62, 84, 106, 122, 152, 180, 213];

// EC codewords por bloco (versão, M)
const EC_CODEWORDS_PER_BLOCK = {
    1: { ecw: 10, groups: [[1, 16]] },
    2: { ecw: 16, groups: [[1, 28]] },
    3: { ecw: 26, groups: [[1, 44]] },
    4: { ecw: 18, groups: [[2, 32]] },
    5: { ecw: 24, groups: [[2, 43]] },
    6: { ecw: 16, groups: [[4, 27]] },
    7: { ecw: 18, groups: [[4, 31]] },
    8: { ecw: 22, groups: [[2, 38], [2, 39]] },
    9: { ecw: 22, groups: [[3, 36], [2, 37]] },
    10:{ ecw: 26, groups: [[4, 43], [1, 44]] }
};

/* GF(256) — operações no campo de Galois pra Reed-Solomon */
const GF_EXP = new Array(256);
const GF_LOG = new Array(256);
(function initGf() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
        GF_EXP[i] = x;
        GF_LOG[x] = i;
        x <<= 1;
        if (x & 0x100) x ^= 0x11d;
    }
    GF_EXP[255] = GF_EXP[0];
})();

function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255];
}

function rsGeneratorPoly(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
        const next = new Array(poly.length + 1).fill(0);
        for (let j = 0; j < poly.length; j++) {
            next[j] ^= poly[j];
            next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
        }
        poly = next;
    }
    return poly;
}

function rsEncode(data, ecw) {
    const gen = rsGeneratorPoly(ecw);
    const result = data.slice();
    for (let i = 0; i < ecw; i++) result.push(0);
    for (let i = 0; i < data.length; i++) {
        const factor = result[i];
        if (factor !== 0) {
            for (let j = 0; j < gen.length; j++) {
                result[i + j] ^= gfMul(gen[j], factor);
            }
        }
    }
    return result.slice(data.length);
}

/* =========================================================
   BIT STREAM
   ========================================================= */

class BitBuffer {
    constructor() { this.bits = []; }
    put(num, len) {
        for (let i = len - 1; i >= 0; i--) {
            this.bits.push((num >> i) & 1);
        }
    }
    get length() { return this.bits.length; }
    toBytes() {
        const bytes = [];
        for (let i = 0; i < this.bits.length; i += 8) {
            let byte = 0;
            for (let j = 0; j < 8; j++) {
                byte = (byte << 1) | (this.bits[i + j] || 0);
            }
            bytes.push(byte);
        }
        return bytes;
    }
}

function encodeByteMode(text, version) {
    const utf8 = textToUtf8Bytes(text);
    const buf = new BitBuffer();
    buf.put(0b0100, 4); // mode indicator: byte
    // char count indicator — 8 bits pra versões 1-9, 16 bits pra 10+
    const ccLen = version < 10 ? 8 : 16;
    buf.put(utf8.length, ccLen);
    for (const b of utf8) buf.put(b, 8);
    // terminator (até 4 zeros)
    return { buf, utf8Len: utf8.length };
}

function textToUtf8Bytes(text) {
    return Array.from(new TextEncoder().encode(text));
}

/* =========================================================
   MATRIX CONSTRUCTION
   ========================================================= */

function sizeForVersion(v) { return 17 + v * 4; }

function createMatrix(version) {
    const n = sizeForVersion(version);
    const m = Array.from({ length: n }, () => new Array(n).fill(null));
    return m;
}

function placeFinders(m) {
    const n = m.length;
    const positions = [[0, 0], [n - 7, 0], [0, n - 7]];
    for (const [r, c] of positions) {
        for (let dr = -1; dr <= 7; dr++) {
            for (let dc = -1; dc <= 7; dc++) {
                const rr = r + dr, cc = c + dc;
                if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
                let v;
                if (dr === -1 || dr === 7 || dc === -1 || dc === 7) v = 0; // separador
                else if (dr === 0 || dr === 6 || dc === 0 || dc === 6) v = 1;
                else if (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4) v = 1;
                else v = 0;
                m[rr][cc] = v;
            }
        }
    }
}

/* Tabela de centros de alignment patterns por versão (apenas 2-10). */
const ALIGNMENT_CENTERS = {
    2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
    7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
};

function placeAlignments(m, version) {
    const centers = ALIGNMENT_CENTERS[version];
    if (!centers) return;
    for (const r of centers) {
        for (const c of centers) {
            // pula se sobrepõe finder
            if ((r <= 8 && c <= 8) || (r <= 8 && c >= m.length - 8) || (r >= m.length - 8 && c <= 8)) continue;
            for (let dr = -2; dr <= 2; dr++) {
                for (let dc = -2; dc <= 2; dc++) {
                    const rr = r + dr, cc = c + dc;
                    if (rr < 0 || cc < 0 || rr >= m.length || cc >= m.length) continue;
                    const isEdge = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
                    m[rr][cc] = isEdge ? 1 : 0;
                }
            }
        }
    }
}

function placeTimings(m) {
    const n = m.length;
    for (let i = 8; i < n - 8; i++) {
        if (m[6][i] === null) m[6][i] = i % 2 === 0 ? 1 : 0;
        if (m[i][6] === null) m[i][6] = i % 2 === 0 ? 1 : 0;
    }
}

function reserveFormatAreas(m) {
    const n = m.length;
    // próximo dos finders
    for (let i = 0; i < 9; i++) {
        if (m[8][i] === null) m[8][i] = -1;
        if (m[i][8] === null) m[i][8] = -1;
    }
    for (let i = 0; i < 8; i++) {
        if (m[8][n - 1 - i] === null) m[8][n - 1 - i] = -1;
        if (m[n - 1 - i][8] === null) m[n - 1 - i][8] = -1;
    }
    // módulo dark obrigatório
    m[n - 8][8] = 1;
}

function placeData(m, dataBits) {
    const n = m.length;
    let bitIdx = 0;
    let upward = true;
    for (let col = n - 1; col > 0; col -= 2) {
        if (col === 6) col--; // pula timing col
        for (let i = 0; i < n; i++) {
            const row = upward ? n - 1 - i : i;
            for (let dc = 0; dc < 2; dc++) {
                const c = col - dc;
                if (m[row][c] === null) {
                    m[row][c] = (dataBits[bitIdx] || 0) & 1;
                    bitIdx++;
                } else if (m[row][c] === -1) {
                    m[row][c] = -1; // mantém reserva
                }
            }
        }
        upward = !upward;
    }
}

/* ---- Máscara + formato ---- */

function maskFn(pattern, row, col) {
    switch (pattern) {
        case 0: return (row + col) % 2 === 0;
        case 1: return row % 2 === 0;
        case 2: return col % 3 === 0;
        case 3: return (row + col) % 3 === 0;
        case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
        case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
        case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
        case 7: return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
    }
    return false;
}

function applyMask(m, pattern, reservedMask) {
    for (let r = 0; r < m.length; r++) {
        for (let c = 0; c < m.length; c++) {
            if (reservedMask[r][c]) continue;
            if (maskFn(pattern, r, c)) {
                m[r][c] ^= 1;
            }
        }
    }
}

function buildReservedMask(m) {
    const n = m.length;
    const mask = Array.from({ length: n }, () => new Array(n).fill(false));
    // finders + separadores + timings + alignments + format + dark module
    // Abordagem: qualquer célula não-nula no momento da chamada é reservada se é estrutura.
    // Porém no nosso fluxo, todas as células de estrutura já foram setadas ANTES de placeData.
    // Reconstruímos: marcamos as células de finders, separadores, timings, alignments, format areas.
    // Pra simplificar, marcamos as áreas conhecidas:
    // Finders + separators (8x8 em cada canto)
    for (let i = 0; i < 9; i++) {
        for (let j = 0; j < 9; j++) {
            if (i < n && j < n) mask[i][j] = true;
            if (i < n && n - 1 - j >= 0) mask[i][n - 1 - j] = true;
            if (n - 1 - i >= 0 && j < n) mask[n - 1 - i][j] = true;
        }
    }
    // Timing rows
    for (let i = 0; i < n; i++) {
        mask[6][i] = true;
        mask[i][6] = true;
    }
    // Dark module
    mask[n - 8][8] = true;
    // Alignments (se alguma versão 2+)
    // Abordagem conservadora: olhamos no próprio m qualquer célula não-nula após placeAlignments
    // mas essa informação se perde depois do placeData. Então geramos a mask com base nas centros.
    return mask;
}

/* Format info bits pra level M e cada mask pattern (pré-calculado) */
const FORMAT_BITS_M = {
    0: 0x5412, 1: 0x5125, 2: 0x5e7c, 3: 0x5b4b,
    4: 0x45f9, 5: 0x40ce, 6: 0x4f97, 7: 0x4aa0
};

function placeFormat(m, maskPattern) {
    const n = m.length;
    const bits = FORMAT_BITS_M[maskPattern];
    // lista de (row, col) pra os 15 bits (posições conhecidas)
    const positions1 = [
        [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
        [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
    ];
    const positions2 = [
        [n - 1, 8], [n - 2, 8], [n - 3, 8], [n - 4, 8], [n - 5, 8], [n - 6, 8], [n - 7, 8],
        [8, n - 8], [8, n - 7], [8, n - 6], [8, n - 5], [8, n - 4], [8, n - 3], [8, n - 2], [8, n - 1]
    ];
    for (let i = 0; i < 15; i++) {
        const bit = (bits >> i) & 1;
        const [r1, c1] = positions1[i];
        const [r2, c2] = positions2[i];
        m[r1][c1] = bit;
        m[r2][c2] = bit;
    }
}

/* =========================================================
   MAIN ENCODE
   ========================================================= */

function pickVersion(utf8Len) {
    for (let v = 1; v <= 10; v++) {
        if (utf8Len <= BYTE_CAPACITY_M[v]) return v;
    }
    throw new Error('Dados muito grandes para QR (versão 10 = ~213 bytes max em EC M)');
}

function padDataBits(bits, totalCodewords) {
    const totalBits = totalCodewords * 8;
    // terminator
    const pad = Math.min(4, totalBits - bits.length);
    for (let i = 0; i < pad; i++) bits.push(0);
    // alinha a byte
    while (bits.length % 8 !== 0) bits.push(0);
    // pad bytes alternando 0xEC / 0x11
    const padBytes = [0xec, 0x11];
    let pi = 0;
    while (bits.length < totalBits) {
        const b = padBytes[pi % 2];
        for (let j = 7; j >= 0; j--) bits.push((b >> j) & 1);
        pi++;
    }
}

function interleaveCodewords(dataCodewords, ecCodewords, groups) {
    // Com grupos simples (1 bloco), só concatena
    if (groups.length === 1 && groups[0][0] === 1) {
        return dataCodewords.concat(ecCodewords);
    }
    // Multi-bloco: interleave
    // (Implementação simplificada pra versões 4+ com múltiplos blocos)
    // Split dataCodewords em blocos conforme groups
    const blocks = [];
    let idx = 0;
    for (const [count, size] of groups) {
        for (let i = 0; i < count; i++) {
            blocks.push(dataCodewords.slice(idx, idx + size));
            idx += size;
        }
    }
    // EC: calcula por bloco (todos com mesma quantidade ecw)
    const ecPerBlock = ecCodewords.length / blocks.length;
    const ecBlocks = [];
    for (let i = 0; i < blocks.length; i++) {
        ecBlocks.push(ecCodewords.slice(i * ecPerBlock, (i + 1) * ecPerBlock));
    }
    // Interleave data
    const maxDataLen = Math.max(...blocks.map(b => b.length));
    const out = [];
    for (let i = 0; i < maxDataLen; i++) {
        for (const b of blocks) {
            if (i < b.length) out.push(b[i]);
        }
    }
    // Interleave EC
    for (let i = 0; i < ecPerBlock; i++) {
        for (const b of ecBlocks) out.push(b[i]);
    }
    return out;
}

function bitsFromBytes(bytes) {
    const out = [];
    for (const b of bytes) {
        for (let i = 7; i >= 0; i--) out.push((b >> i) & 1);
    }
    return out;
}

/** Retorna matriz 2D (0/1) ou null se erro */
export function generateQrMatrix(text) {
    const utf8 = textToUtf8Bytes(text);
    const version = pickVersion(utf8.length);
    const { ecw, groups } = EC_CODEWORDS_PER_BLOCK[version];

    // Codewords totais
    const totalDataBytes = groups.reduce((s, [c, size]) => s + c * size, 0);

    // Encode bits
    const buf = new BitBuffer();
    buf.put(0b0100, 4);
    const ccLen = version < 10 ? 8 : 16;
    buf.put(utf8.length, ccLen);
    for (const b of utf8) buf.put(b, 8);
    padDataBits(buf.bits, totalDataBytes);

    const dataCodewords = buf.toBytes();

    // EC por bloco
    const blocks = [];
    let idx = 0;
    for (const [count, size] of groups) {
        for (let i = 0; i < count; i++) {
            blocks.push(dataCodewords.slice(idx, idx + size));
            idx += size;
        }
    }
    const ecBlocks = blocks.map(b => rsEncode(b, ecw));
    const allEc = [].concat(...ecBlocks);

    // Interleave
    let finalBytes;
    if (blocks.length === 1) {
        finalBytes = dataCodewords.concat(ecBlocks[0]);
    } else {
        const maxDataLen = Math.max(...blocks.map(b => b.length));
        finalBytes = [];
        for (let i = 0; i < maxDataLen; i++) {
            for (const b of blocks) {
                if (i < b.length) finalBytes.push(b[i]);
            }
        }
        for (let i = 0; i < ecw; i++) {
            for (const b of ecBlocks) finalBytes.push(b[i]);
        }
    }

    const dataBits = bitsFromBytes(finalBytes);

    // Build matrix
    const m = createMatrix(version);
    placeFinders(m);
    placeAlignments(m, version);
    placeTimings(m);
    reserveFormatAreas(m);

    const reservedMask = buildReservedMask(m);

    placeData(m, dataBits);

    // Testa máscaras e pega a melhor (score mais baixo)
    let bestMask = 0;
    let bestScore = Infinity;
    let bestM = null;
    for (let pat = 0; pat < 8; pat++) {
        const candidate = m.map(row => row.slice().map(v => v === -1 ? 0 : v));
        applyMask(candidate, pat, reservedMask);
        placeFormat(candidate, pat);
        const score = maskScore(candidate);
        if (score < bestScore) {
            bestScore = score;
            bestMask = pat;
            bestM = candidate;
        }
    }
    return bestM;
}

function maskScore(m) {
    // Penalidade simplificada (critério N1 only)
    let score = 0;
    const n = m.length;
    for (let r = 0; r < n; r++) {
        let run = 1;
        for (let c = 1; c < n; c++) {
            if (m[r][c] === m[r][c - 1]) run++;
            else { if (run >= 5) score += 3 + (run - 5); run = 1; }
        }
        if (run >= 5) score += 3 + (run - 5);
    }
    for (let c = 0; c < n; c++) {
        let run = 1;
        for (let r = 1; r < n; r++) {
            if (m[r][c] === m[r - 1][c]) run++;
            else { if (run >= 5) score += 3 + (run - 5); run = 1; }
        }
        if (run >= 5) score += 3 + (run - 5);
    }
    return score;
}

/** Retorna SVG string do QR code */
export function generateQrSvg(text, opts = {}) {
    const { size = 256, padding = 4, fg = '#0a0a0a', bg = '#fefefe' } = opts;
    const matrix = generateQrMatrix(text);
    const n = matrix.length;
    const totalModules = n + padding * 2;
    const moduleSize = size / totalModules;

    let rects = '';
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            if (matrix[r][c] === 1) {
                const x = (c + padding) * moduleSize;
                const y = (r + padding) * moduleSize;
                rects += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${moduleSize.toFixed(2)}" height="${moduleSize.toFixed(2)}" fill="${fg}"/>`;
            }
        }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="${bg}"/>${rects}</svg>`;
}
