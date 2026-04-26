/**
 * qrcode-generator — port mínimo da lib MIT de Kazuhiko Arase.
 * Original: https://github.com/kazuhikoarase/qrcode-generator
 *
 * Implementa modo byte (UTF-8), nível de correção M (15%),
 * versões 1 a 10 (até ~213 bytes). Suficiente pra payloads
 * de assinatura (~150 chars).
 *
 * Sem dependências, sem network. Funciona offline.
 *
 * Uso:
 *   const qr = qrcode(0, 'M');  // 0 = autoselect version
 *   qr.addData('texto utf-8');
 *   qr.make();
 *   qr.getModuleCount();         // tamanho NxN
 *   qr.isDark(row, col);         // bit do módulo
 */

(function (root) {

    // ------------------------------------------------------------
    // QRMode, QRErrorCorrectionLevel
    // ------------------------------------------------------------
    var QRMode = { MODE_8BIT_BYTE: 1 << 2 };
    var QRErrorCorrectionLevel = { L: 1, M: 0, Q: 3, H: 2 };

    // ------------------------------------------------------------
    // QRMath: campo de Galois GF(256)
    // ------------------------------------------------------------
    var QRMath = (function () {
        var EXP_TABLE = new Array(256);
        var LOG_TABLE = new Array(256);
        for (var i = 0; i < 8; i++) EXP_TABLE[i] = 1 << i;
        for (var i = 8; i < 256; i++) {
            EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
        }
        for (var i = 0; i < 255; i++) LOG_TABLE[EXP_TABLE[i]] = i;

        return {
            glog: function (n) { if (n < 1) throw 'glog(' + n + ')'; return LOG_TABLE[n]; },
            gexp: function (n) { while (n < 0) n += 255; while (n >= 256) n -= 255; return EXP_TABLE[n]; }
        };
    })();

    // ------------------------------------------------------------
    // QRPolynomial
    // ------------------------------------------------------------
    function QRPolynomial(num, shift) {
        if (num.length === undefined) throw 'num.length undef';
        var offset = 0;
        while (offset < num.length && num[offset] === 0) offset++;
        this.num = new Array(num.length - offset + shift);
        for (var i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset];
    }
    QRPolynomial.prototype = {
        getAt: function (i) { return this.num[i]; },
        getLength: function () { return this.num.length; },
        multiply: function (e) {
            var num = new Array(this.getLength() + e.getLength() - 1);
            for (var i = 0; i < num.length; i++) num[i] = 0;
            for (var i = 0; i < this.getLength(); i++) {
                for (var j = 0; j < e.getLength(); j++) {
                    num[i + j] ^= QRMath.gexp(QRMath.glog(this.getAt(i)) + QRMath.glog(e.getAt(j)));
                }
            }
            return new QRPolynomial(num, 0);
        },
        mod: function (e) {
            if (this.getLength() - e.getLength() < 0) return this;
            var ratio = QRMath.glog(this.getAt(0)) - QRMath.glog(e.getAt(0));
            var num = new Array(this.getLength());
            for (var i = 0; i < this.getLength(); i++) num[i] = this.getAt(i);
            for (var i = 0; i < e.getLength(); i++) num[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i)) + ratio);
            return new QRPolynomial(num, 0).mod(e);
        }
    };

    // ------------------------------------------------------------
    // QRRSBlock — tabela de blocos por versão+EC level
    // ------------------------------------------------------------
    function QRRSBlock(totalCount, dataCount) {
        this.totalCount = totalCount;
        this.dataCount = dataCount;
    }
    QRRSBlock.RS_BLOCK_TABLE = [
        // L, M, Q, H — versão 1
        [1, 26, 19],
        [1, 26, 16],
        [1, 26, 13],
        [1, 26, 9],
        // versão 2
        [1, 44, 34],
        [1, 44, 28],
        [1, 44, 22],
        [1, 44, 16],
        // versão 3
        [1, 70, 55],
        [1, 70, 44],
        [2, 35, 17],
        [2, 35, 13],
        // versão 4
        [1, 100, 80],
        [2, 50, 32],
        [2, 50, 24],
        [4, 25, 9],
        // versão 5
        [1, 134, 108],
        [2, 67, 43],
        [2, 33, 15, 2, 34, 16],
        [2, 33, 11, 2, 34, 12],
        // versão 6
        [2, 86, 68],
        [4, 43, 27],
        [4, 43, 19],
        [4, 43, 15],
        // versão 7
        [2, 98, 78],
        [4, 49, 31],
        [2, 32, 14, 4, 33, 15],
        [4, 39, 13, 1, 40, 14],
        // versão 8
        [2, 121, 97],
        [2, 60, 38, 2, 61, 39],
        [4, 40, 18, 2, 41, 19],
        [4, 40, 14, 2, 41, 15],
        // versão 9
        [2, 146, 116],
        [3, 58, 36, 2, 59, 37],
        [4, 36, 16, 4, 37, 17],
        [4, 36, 12, 4, 37, 13],
        // versão 10
        [2, 86, 68, 2, 87, 69],
        [4, 69, 43, 1, 70, 44],
        [6, 43, 19, 2, 44, 20],
        [6, 43, 15, 2, 44, 16]
    ];

    QRRSBlock.getRSBlocks = function (typeNumber, errorCorrectionLevel) {
        var rsBlock = QRRSBlock.getRsBlockTable(typeNumber, errorCorrectionLevel);
        if (rsBlock === undefined) throw 'bad rs block @ v=' + typeNumber + '/EC=' + errorCorrectionLevel;
        var length = rsBlock.length / 3;
        var list = [];
        for (var i = 0; i < length; i++) {
            var count = rsBlock[i * 3];
            var totalCount = rsBlock[i * 3 + 1];
            var dataCount = rsBlock[i * 3 + 2];
            for (var j = 0; j < count; j++) list.push(new QRRSBlock(totalCount, dataCount));
        }
        return list;
    };

    QRRSBlock.getRsBlockTable = function (typeNumber, errorCorrectionLevel) {
        switch (errorCorrectionLevel) {
            case QRErrorCorrectionLevel.L: return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
            case QRErrorCorrectionLevel.M: return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
            case QRErrorCorrectionLevel.Q: return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
            case QRErrorCorrectionLevel.H: return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
        }
    };

    // ------------------------------------------------------------
    // QRBitBuffer
    // ------------------------------------------------------------
    function QRBitBuffer() { this.buffer = []; this.length = 0; }
    QRBitBuffer.prototype = {
        getBuffer: function () { return this.buffer; },
        getAt: function (i) {
            var bufIndex = Math.floor(i / 8);
            return ((this.buffer[bufIndex] >>> (7 - i % 8)) & 1) === 1;
        },
        put: function (num, length) {
            for (var i = 0; i < length; i++) this.putBit(((num >>> (length - i - 1)) & 1) === 1);
        },
        getLengthInBits: function () { return this.length; },
        putBit: function (bit) {
            var bufIndex = Math.floor(this.length / 8);
            if (this.buffer.length <= bufIndex) this.buffer.push(0);
            if (bit) this.buffer[bufIndex] |= (0x80 >>> (this.length % 8));
            this.length++;
        }
    };

    // ------------------------------------------------------------
    // qr8BitByte — modo byte UTF-8
    // ------------------------------------------------------------
    function qr8BitByte(data) {
        this.mode = QRMode.MODE_8BIT_BYTE;
        // Converte string pra UTF-8 bytes
        var bytes = [];
        for (var i = 0; i < data.length; i++) {
            var c = data.charCodeAt(i);
            if (c < 0x80) bytes.push(c);
            else if (c < 0x800) {
                bytes.push(0xc0 | (c >> 6));
                bytes.push(0x80 | (c & 0x3f));
            } else if (c < 0xd800 || c >= 0xe000) {
                bytes.push(0xe0 | (c >> 12));
                bytes.push(0x80 | ((c >> 6) & 0x3f));
                bytes.push(0x80 | (c & 0x3f));
            } else {
                // surrogate pair
                i++;
                var c2 = data.charCodeAt(i);
                var u = 0x10000 + (((c & 0x3ff) << 10) | (c2 & 0x3ff));
                bytes.push(0xf0 | (u >> 18));
                bytes.push(0x80 | ((u >> 12) & 0x3f));
                bytes.push(0x80 | ((u >> 6) & 0x3f));
                bytes.push(0x80 | (u & 0x3f));
            }
        }
        this.parsedData = bytes;
    }
    qr8BitByte.prototype = {
        getMode: function () { return this.mode; },
        getLength: function () { return this.parsedData.length; },
        write: function (buffer) {
            for (var i = 0; i < this.parsedData.length; i++) buffer.put(this.parsedData[i], 8);
        }
    };

    // ------------------------------------------------------------
    // QRUtil — lookup tables
    // ------------------------------------------------------------
    var QRUtil = {
        PATTERN_POSITION_TABLE: [
            [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
            [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]
        ],
        G15: (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0),
        G18: (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0),
        G15_MASK: (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1),

        getBCHTypeInfo: function (data) {
            var d = data << 10;
            while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) >= 0) {
                d ^= QRUtil.G15 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15));
            }
            return ((data << 10) | d) ^ QRUtil.G15_MASK;
        },
        getBCHTypeNumber: function (data) {
            var d = data << 12;
            while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) >= 0) {
                d ^= QRUtil.G18 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18));
            }
            return (data << 12) | d;
        },
        getBCHDigit: function (data) {
            var digit = 0;
            while (data !== 0) { digit++; data >>>= 1; }
            return digit;
        },
        getPatternPosition: function (typeNumber) { return QRUtil.PATTERN_POSITION_TABLE[typeNumber - 1]; },
        getMask: function (maskPattern, i, j) {
            switch (maskPattern) {
                case 0: return (i + j) % 2 === 0;
                case 1: return i % 2 === 0;
                case 2: return j % 3 === 0;
                case 3: return (i + j) % 3 === 0;
                case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
                case 5: return ((i * j) % 2) + ((i * j) % 3) === 0;
                case 6: return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
                case 7: return (((i * j) % 3) + ((i + j) % 2)) % 2 === 0;
            }
            throw 'bad mask:' + maskPattern;
        },
        getErrorCorrectPolynomial: function (errorCorrectLength) {
            var a = new QRPolynomial([1], 0);
            for (var i = 0; i < errorCorrectLength; i++) {
                a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0));
            }
            return a;
        },
        getLengthInBits: function (mode, type) {
            if (1 <= type && type < 10) {
                if (mode === QRMode.MODE_8BIT_BYTE) return 8;
            } else if (type < 27) {
                if (mode === QRMode.MODE_8BIT_BYTE) return 16;
            }
            throw 'bad mode/type:' + mode + '/' + type;
        },
        getLostPoint: function (qrcode) {
            var moduleCount = qrcode.getModuleCount();
            var lostPoint = 0;
            // Same color in row/col
            for (var row = 0; row < moduleCount; row++) {
                for (var col = 0; col < moduleCount; col++) {
                    var sameCount = 0;
                    var dark = qrcode.isDark(row, col);
                    for (var r = -1; r <= 1; r++) {
                        if (row + r < 0 || moduleCount <= row + r) continue;
                        for (var c = -1; c <= 1; c++) {
                            if (col + c < 0 || moduleCount <= col + c) continue;
                            if (r === 0 && c === 0) continue;
                            if (dark === qrcode.isDark(row + r, col + c)) sameCount++;
                        }
                    }
                    if (sameCount > 5) lostPoint += (3 + sameCount - 5);
                }
            }
            // 2x2 same
            for (var row = 0; row < moduleCount - 1; row++) {
                for (var col = 0; col < moduleCount - 1; col++) {
                    var count = 0;
                    if (qrcode.isDark(row, col)) count++;
                    if (qrcode.isDark(row + 1, col)) count++;
                    if (qrcode.isDark(row, col + 1)) count++;
                    if (qrcode.isDark(row + 1, col + 1)) count++;
                    if (count === 0 || count === 4) lostPoint += 3;
                }
            }
            // 1:1:3:1:1 pattern
            for (var row = 0; row < moduleCount; row++) {
                for (var col = 0; col < moduleCount - 6; col++) {
                    if (qrcode.isDark(row, col) &&
                        !qrcode.isDark(row, col + 1) &&
                        qrcode.isDark(row, col + 2) &&
                        qrcode.isDark(row, col + 3) &&
                        qrcode.isDark(row, col + 4) &&
                        !qrcode.isDark(row, col + 5) &&
                        qrcode.isDark(row, col + 6)) lostPoint += 40;
                }
            }
            for (var col = 0; col < moduleCount; col++) {
                for (var row = 0; row < moduleCount - 6; row++) {
                    if (qrcode.isDark(row, col) &&
                        !qrcode.isDark(row + 1, col) &&
                        qrcode.isDark(row + 2, col) &&
                        qrcode.isDark(row + 3, col) &&
                        qrcode.isDark(row + 4, col) &&
                        !qrcode.isDark(row + 5, col) &&
                        qrcode.isDark(row + 6, col)) lostPoint += 40;
                }
            }
            // dark ratio
            var darkCount = 0;
            for (var col = 0; col < moduleCount; col++) {
                for (var row = 0; row < moduleCount; row++) {
                    if (qrcode.isDark(row, col)) darkCount++;
                }
            }
            var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
            lostPoint += ratio * 10;
            return lostPoint;
        }
    };

    // ------------------------------------------------------------
    // qrcode — função principal
    // ------------------------------------------------------------
    function qrcode(typeNumber, errorCorrectionLevel) {
        var PAD0 = 0xEC;
        var PAD1 = 0x11;

        var _typeNumber = typeNumber;
        var _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel] !== undefined
            ? QRErrorCorrectionLevel[errorCorrectionLevel]
            : QRErrorCorrectionLevel.M;
        var _modules = null;
        var _moduleCount = 0;
        var _dataCache = null;
        var _dataList = [];

        var _this = {};

        var makeImpl = function (test, maskPattern) {
            _moduleCount = _typeNumber * 4 + 17;
            _modules = (function (moduleCount) {
                var modules = new Array(moduleCount);
                for (var row = 0; row < moduleCount; row++) {
                    modules[row] = new Array(moduleCount);
                    for (var col = 0; col < moduleCount; col++) modules[row][col] = null;
                }
                return modules;
            })(_moduleCount);

            setupPositionProbePattern(0, 0);
            setupPositionProbePattern(_moduleCount - 7, 0);
            setupPositionProbePattern(0, _moduleCount - 7);
            setupPositionAdjustPattern();
            setupTimingPattern();
            setupTypeInfo(test, maskPattern);
            if (_typeNumber >= 7) setupTypeNumber(test);
            if (_dataCache === null) _dataCache = createData(_typeNumber, _errorCorrectionLevel, _dataList);
            mapData(_dataCache, maskPattern);
        };

        var setupPositionProbePattern = function (row, col) {
            for (var r = -1; r <= 7; r++) {
                if (row + r <= -1 || _moduleCount <= row + r) continue;
                for (var c = -1; c <= 7; c++) {
                    if (col + c <= -1 || _moduleCount <= col + c) continue;
                    _modules[row + r][col + c] =
                        (0 <= r && r <= 6 && (c === 0 || c === 6)) ||
                        (0 <= c && c <= 6 && (r === 0 || r === 6)) ||
                        (2 <= r && r <= 4 && 2 <= c && c <= 4);
                }
            }
        };

        var getBestMaskPattern = function () {
            var minLostPoint = 0;
            var pattern = 0;
            for (var i = 0; i < 8; i++) {
                makeImpl(true, i);
                var lostPoint = QRUtil.getLostPoint(_this);
                if (i === 0 || minLostPoint > lostPoint) {
                    minLostPoint = lostPoint;
                    pattern = i;
                }
            }
            return pattern;
        };

        var setupTimingPattern = function () {
            for (var r = 8; r < _moduleCount - 8; r++) {
                if (_modules[r][6] !== null) continue;
                _modules[r][6] = (r % 2 === 0);
            }
            for (var c = 8; c < _moduleCount - 8; c++) {
                if (_modules[6][c] !== null) continue;
                _modules[6][c] = (c % 2 === 0);
            }
        };

        var setupPositionAdjustPattern = function () {
            var pos = QRUtil.getPatternPosition(_typeNumber);
            for (var i = 0; i < pos.length; i++) {
                for (var j = 0; j < pos.length; j++) {
                    var row = pos[i];
                    var col = pos[j];
                    if (_modules[row][col] !== null) continue;
                    for (var r = -2; r <= 2; r++) {
                        for (var c = -2; c <= 2; c++) {
                            _modules[row + r][col + c] = (r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0));
                        }
                    }
                }
            }
        };

        var setupTypeNumber = function (test) {
            var bits = QRUtil.getBCHTypeNumber(_typeNumber);
            for (var i = 0; i < 18; i++) {
                var mod = (!test && ((bits >> i) & 1) === 1);
                _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
            }
            for (var i = 0; i < 18; i++) {
                var mod = (!test && ((bits >> i) & 1) === 1);
                _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
            }
        };

        var setupTypeInfo = function (test, maskPattern) {
            var data = (_errorCorrectionLevel << 3) | maskPattern;
            var bits = QRUtil.getBCHTypeInfo(data);
            // vertical
            for (var i = 0; i < 15; i++) {
                var mod = (!test && ((bits >> i) & 1) === 1);
                if (i < 6) _modules[i][8] = mod;
                else if (i < 8) _modules[i + 1][8] = mod;
                else _modules[_moduleCount - 15 + i][8] = mod;
            }
            // horizontal
            for (var i = 0; i < 15; i++) {
                var mod = (!test && ((bits >> i) & 1) === 1);
                if (i < 8) _modules[8][_moduleCount - i - 1] = mod;
                else if (i < 9) _modules[8][15 - i - 1 + 1] = mod;
                else _modules[8][15 - i - 1] = mod;
            }
            _modules[_moduleCount - 8][8] = (!test);
        };

        var mapData = function (data, maskPattern) {
            var inc = -1;
            var row = _moduleCount - 1;
            var bitIndex = 7;
            var byteIndex = 0;
            for (var col = _moduleCount - 1; col > 0; col -= 2) {
                if (col === 6) col--;
                while (true) {
                    for (var c = 0; c < 2; c++) {
                        if (_modules[row][col - c] === null) {
                            var dark = false;
                            if (byteIndex < data.length) dark = (((data[byteIndex] >>> bitIndex) & 1) === 1);
                            var mask = QRUtil.getMask(maskPattern, row, col - c);
                            if (mask) dark = !dark;
                            _modules[row][col - c] = dark;
                            bitIndex--;
                            if (bitIndex === -1) {
                                byteIndex++;
                                bitIndex = 7;
                            }
                        }
                    }
                    row += inc;
                    if (row < 0 || _moduleCount <= row) {
                        row -= inc;
                        inc = -inc;
                        break;
                    }
                }
            }
        };

        var createBytes = function (buffer, rsBlocks) {
            var offset = 0;
            var maxDcCount = 0;
            var maxEcCount = 0;
            var dcdata = new Array(rsBlocks.length);
            var ecdata = new Array(rsBlocks.length);
            for (var r = 0; r < rsBlocks.length; r++) {
                var dcCount = rsBlocks[r].dataCount;
                var ecCount = rsBlocks[r].totalCount - dcCount;
                maxDcCount = Math.max(maxDcCount, dcCount);
                maxEcCount = Math.max(maxEcCount, ecCount);
                dcdata[r] = new Array(dcCount);
                for (var i = 0; i < dcdata[r].length; i++) dcdata[r][i] = 0xff & buffer.getBuffer()[i + offset];
                offset += dcCount;
                var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
                var rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);
                var modPoly = rawPoly.mod(rsPoly);
                ecdata[r] = new Array(rsPoly.getLength() - 1);
                for (var i = 0; i < ecdata[r].length; i++) {
                    var modIndex = i + modPoly.getLength() - ecdata[r].length;
                    ecdata[r][i] = (modIndex >= 0) ? modPoly.getAt(modIndex) : 0;
                }
            }
            var totalCodeCount = 0;
            for (var i = 0; i < rsBlocks.length; i++) totalCodeCount += rsBlocks[i].totalCount;
            var data = new Array(totalCodeCount);
            var index = 0;
            for (var i = 0; i < maxDcCount; i++) {
                for (var r = 0; r < rsBlocks.length; r++) {
                    if (i < dcdata[r].length) data[index++] = dcdata[r][i];
                }
            }
            for (var i = 0; i < maxEcCount; i++) {
                for (var r = 0; r < rsBlocks.length; r++) {
                    if (i < ecdata[r].length) data[index++] = ecdata[r][i];
                }
            }
            return data;
        };

        var createData = function (typeNumber, errorCorrectionLevel, dataList) {
            var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectionLevel);
            var buffer = new QRBitBuffer();
            for (var i = 0; i < dataList.length; i++) {
                var data = dataList[i];
                buffer.put(data.getMode(), 4);
                buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber));
                data.write(buffer);
            }
            var totalDataCount = 0;
            for (var i = 0; i < rsBlocks.length; i++) totalDataCount += rsBlocks[i].dataCount;
            if (buffer.getLengthInBits() > totalDataCount * 8) {
                throw 'overflow code length: ' + buffer.getLengthInBits() + ' > ' + (totalDataCount * 8);
            }
            if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) buffer.put(0, 4);
            while (buffer.getLengthInBits() % 8 !== 0) buffer.putBit(false);
            while (true) {
                if (buffer.getLengthInBits() >= totalDataCount * 8) break;
                buffer.put(PAD0, 8);
                if (buffer.getLengthInBits() >= totalDataCount * 8) break;
                buffer.put(PAD1, 8);
            }
            return createBytes(buffer, rsBlocks);
        };

        _this.addData = function (data) {
            _dataList.push(new qr8BitByte(String(data)));
            _dataCache = null;
        };

        _this.isDark = function (row, col) {
            if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
                throw 'bad row/col:' + row + '/' + col;
            }
            return _modules[row][col];
        };

        _this.getModuleCount = function () { return _moduleCount; };

        _this.make = function () {
            if (_typeNumber < 1) {
                // autoselect: tenta de 1 até 10
                var typeNumber = 1;
                for (; typeNumber < 11; typeNumber++) {
                    var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, _errorCorrectionLevel);
                    var buffer = new QRBitBuffer();
                    for (var i = 0; i < _dataList.length; i++) {
                        var data = _dataList[i];
                        buffer.put(data.getMode(), 4);
                        buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber));
                        data.write(buffer);
                    }
                    var totalDataCount = 0;
                    for (var i = 0; i < rsBlocks.length; i++) totalDataCount += rsBlocks[i].dataCount;
                    if (buffer.getLengthInBits() <= totalDataCount * 8) break;
                }
                if (typeNumber > 10) throw 'data too long for QR (max version 10 reached)';
                _typeNumber = typeNumber;
            }
            makeImpl(false, getBestMaskPattern());
        };

        return _this;
    }

    qrcode.stringToBytes = function (s) {
        var bytes = [];
        for (var i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i) & 0xff);
        return bytes;
    };

    // expose
    root.qrcode = qrcode;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
