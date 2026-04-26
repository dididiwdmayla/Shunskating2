/**
 * qr-gen.js — wrapper sobre js/vendor/qrcode-generator.js
 * A lib é carregada como script global (window.qrcode). Aqui só
 * gera SVG a partir da matriz dela.
 */

function ensureLib() {
    if (typeof window === 'undefined' || typeof window.qrcode !== 'function') {
        throw new Error('qrcode lib não carregada — verifica js/vendor/qrcode-generator.js no index.html');
    }
    return window.qrcode;
}

export function generateQrSvg(text, opts = {}) {
    const { size = 256, padding = 4, fg = '#0a0a0a', bg = '#fefefe' } = opts;
    const qrcode = ensureLib();
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();

    const n = qr.getModuleCount();
    const totalModules = n + padding * 2;
    const moduleSize = size / totalModules;

    let rects = '';
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            if (qr.isDark(r, c)) {
                const x = (c + padding) * moduleSize;
                const y = (r + padding) * moduleSize;
                rects += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${moduleSize.toFixed(2)}" height="${moduleSize.toFixed(2)}" fill="${fg}"/>`;
            }
        }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="${bg}"/>${rects}</svg>`;
}
