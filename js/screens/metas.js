/**
 * screens/metas.js
 *
 * METAS — diária, semanal, mensal.
 * Cada meta tem um conjunto de manobras-alvo. Usuário marca as
 * completadas; visual de progresso aparece.
 *
 * Filosofia: não é "todo lista" — é compromisso com sessão.
 * Diária = pra hoje. Semanal = pra essa semana. Mensal = pro mês.
 * Expiradas ficam visíveis 7 dias como histórico, depois somem.
 */

import { el, fetchJson } from '../utils.js';
import { navigate } from '../navigation.js';
import {
    getActiveGoals, getRecentGoals, addGoal,
    toggleGoalTrickCompletion, deleteGoal, purgeOldGoals,
    getUserLines, saveUserLine, deleteUserLine, markUserLineCompleted,
    getSuggestedLine, getProgressAverage
} from '../storage.js';
import * as linesEngine from '../lines-engine.js';

let tricksData = null;
let historicLinesData = null;

async function loadTricks() {
    if (tricksData) return tricksData;
    tricksData = await fetchJson('data/tricks.json');
    return tricksData;
}

async function loadHistoricLines() {
    if (historicLinesData) return historicLinesData;
    try {
        historicLinesData = await fetchJson('data/lines.json');
    } catch (e) {
        historicLinesData = { lines: [] };
    }
    return historicLinesData;
}

/* =========================================================
   RENDER PRINCIPAL
   ========================================================= */

async function render(container) {
    // limpa metas antigas (>14 dias)
    purgeOldGoals(14);

    const data = await loadTricks();

    const screen = el('div', { className: 'screen-metas' });

    /* --- HEADER --- */
    screen.appendChild(el('h1', { className: 'metas-title xerox-tremor' }, 'METAS'));
    screen.appendChild(el('p', { className: 'metas-subtitle' },
        'Compromisso por sessão. ',
        el('strong', {}, 'Diária'), ' pra hoje, ',
        el('strong', {}, 'semanal'), ' pra essa semana, ',
        el('strong', {}, 'mensal'), ' pro mês.'
    ));

    /* --- BOTÕES DE CRIAR (uma por tipo) --- */
    const createRow = el('div', { className: 'metas-create-row' });
    ['daily', 'weekly', 'monthly'].forEach(type => {
        createRow.appendChild(el('button', {
            className: `meta-create-btn meta-create-${type}`,
            type: 'button',
            onClick: () => openCreateForm(screen, data, type)
        },
            el('span', { className: 'meta-create-label' }, labelForType(type)),
            el('span', { className: 'meta-create-plus' }, '+')
        ));
    });
    screen.appendChild(createRow);

    /* --- LISTA DE METAS ATIVAS --- */
    const activeSection = el('section', { className: 'metas-section' });
    activeSection.appendChild(el('h2', { className: 'metas-section-title' }, 'ATIVAS'));
    const activeList = el('div', { className: 'metas-list', id: 'metas-active-list' });
    activeSection.appendChild(activeList);
    screen.appendChild(activeSection);

    /* --- LINHAS --- */
    const linesData = await loadHistoricLines();
    const linesSection = el('section', { className: 'metas-section metas-lines-section' });
    linesSection.appendChild(el('h2', { className: 'metas-section-title' }, 'LINHAS'));

    /* sub-seção: linha do dia */
    linesSection.appendChild(renderLineOfTheDay(screen, data));

    /* sub-seção: suas linhas */
    linesSection.appendChild(renderUserLines(screen, data));

    /* sub-seção: linhas lendárias */
    linesSection.appendChild(renderHistoricLines(linesData));

    screen.appendChild(linesSection);

    /* --- HISTÓRICO RECENTE (expiradas) --- */
    const historySection = el('section', { className: 'metas-section' });
    historySection.appendChild(el('h2', { className: 'metas-section-title metas-section-history' }, 'HISTÓRICO'));
    const historyList = el('div', { className: 'metas-list metas-list-history', id: 'metas-history-list' });
    historySection.appendChild(historyList);
    screen.appendChild(historySection);

    container.appendChild(screen);

    refreshLists(screen, data);
}

function refreshLists(screen, data) {
    const activeList = screen.querySelector('#metas-active-list');
    const historyList = screen.querySelector('#metas-history-list');

    if (activeList) {
        activeList.innerHTML = '';
        const active = getActiveGoals();
        if (active.length === 0) {
            activeList.appendChild(el('p', { className: 'metas-empty' },
                '— nenhuma meta ativa. cria uma aí em cima. —'
            ));
        } else {
            // ordena: diária > semanal > mensal > por data de criação
            const order = { daily: 0, weekly: 1, monthly: 2 };
            active.sort((a, b) => {
                if (order[a.type] !== order[b.type]) return order[a.type] - order[b.type];
                return new Date(b.createdAt) - new Date(a.createdAt);
            });
            active.forEach(g => activeList.appendChild(renderGoalCard(g, data, screen, false)));
        }
    }

    if (historyList) {
        historyList.innerHTML = '';
        const recent = getRecentGoals(7);
        if (recent.length === 0) {
            historyList.appendChild(el('p', { className: 'metas-empty metas-empty-history' },
                '— ainda sem histórico —'
            ));
        } else {
            recent.sort((a, b) => new Date(b.expiresAt) - new Date(a.expiresAt));
            recent.forEach(g => historyList.appendChild(renderGoalCard(g, data, screen, true)));
        }
    }
}

/* =========================================================
   CARD DE META
   ========================================================= */

function renderGoalCard(goal, data, screen, isHistory) {
    const tricksMap = new Map(data.tricks.map(t => [t.id, t]));
    const total = goal.trickIds.length;
    const done = goal.completed.length;
    const pct = total > 0 ? Math.round(done / total * 100) : 0;
    const isComplete = total > 0 && done === total;

    const card = el('div', {
        className: `meta-card meta-card-${goal.type}${isComplete ? ' is-complete' : ''}${isHistory ? ' is-history' : ''}`
    });

    // header com tipo + prazo + botão deletar
    const header = el('div', { className: 'meta-card-header' },
        el('span', { className: `meta-type-badge meta-type-${goal.type}` }, labelForType(goal.type)),
        el('span', { className: 'meta-deadline' }, deadlineLabel(goal))
    );
    header.appendChild(el('button', {
        className: 'meta-delete-btn',
        type: 'button',
        'aria-label': 'Apagar meta',
        title: 'Apagar meta',
        onClick: () => {
            if (!confirm('Apagar essa meta?')) return;
            deleteGoal(goal.id);
            refreshLists(screen, data);
        }
    }, '×'));
    card.appendChild(header);

    // nota (se tiver)
    if (goal.note) {
        card.appendChild(el('p', { className: 'meta-note' }, goal.note));
    }

    // barra de progresso
    const progBar = el('div', { className: 'meta-progress' },
        el('div', {
            className: 'meta-progress-fill',
            style: { width: `${pct}%` }
        }),
        el('span', { className: 'meta-progress-text' }, `${done}/${total}`)
    );
    card.appendChild(progBar);

    // lista de manobras com checkbox
    const list = el('ul', { className: 'meta-tricks-list' });
    goal.trickIds.forEach(tid => {
        const trick = tricksMap.get(tid);
        if (!trick) return;
        const isDone = goal.completed.includes(tid);

        const li = el('li', {
            className: `meta-trick-item${isDone ? ' is-done' : ''}`
        });

        const checkbox = el('button', {
            className: `meta-check${isDone ? ' is-checked' : ''}`,
            type: 'button',
            'aria-label': isDone ? 'Desmarcar' : 'Marcar como completo',
            onClick: () => {
                if (isHistory) return; // não permite marcar em histórico
                toggleGoalTrickCompletion(goal.id, tid);
                refreshLists(screen, data);
            }
        });
        // check svg
        checkbox.innerHTML = `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <polyline points="4 12 10 18 20 6" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
        li.appendChild(checkbox);

        const info = el('button', {
            className: 'meta-trick-info',
            type: 'button',
            'aria-label': `Abrir ${trick.name}`,
            onClick: () => navigate('trickDetail', { id: trick.id })
        },
            el('span', { className: 'meta-trick-name' }, trick.name),
            el('span', { className: 'meta-trick-cat' }, (trick.category || '').toUpperCase())
        );
        li.appendChild(info);

        list.appendChild(li);
    });
    card.appendChild(list);

    return card;
}

/* =========================================================
   FORMULÁRIO DE CRIAÇÃO (overlay)
   ========================================================= */

function openCreateForm(screen, data, type) {
    const overlay = el('div', {
        className: 'meta-form-overlay',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': `Criar meta ${labelForType(type)}`,
        onClick: (e) => {
            if (e.target === overlay) closeForm(overlay);
        }
    });

    const card = el('div', { className: `meta-form-card meta-form-${type}` });

    // header
    card.appendChild(el('h2', { className: 'meta-form-title' },
        el('span', { className: 'meta-form-label' }, 'NOVA META'),
        el('span', { className: `meta-type-badge meta-type-${type}` }, labelForType(type))
    ));

    // nota opcional
    const noteInput = el('textarea', {
        className: 'meta-form-note',
        placeholder: 'nota (opcional): qual seu foco nessa meta?',
        rows: 2,
        'aria-label': 'Nota opcional da meta'
    });
    card.appendChild(noteInput);

    // seleção de manobras
    card.appendChild(el('h3', { className: 'meta-form-section-title' }, 'MANOBRAS-ALVO'));

    const tricksContainer = el('div', { className: 'meta-form-tricks' });
    const selected = new Set();

    // agrupa por categoria
    const byCategory = {};
    data.tricks.forEach(t => {
        if (!byCategory[t.category]) byCategory[t.category] = [];
        byCategory[t.category].push(t);
    });

    data.categories.forEach(cat => {
        const list = byCategory[cat.id];
        if (!list || list.length === 0) return;

        tricksContainer.appendChild(el('div', { className: 'meta-form-cat-label' }, cat.name.toUpperCase()));

        const grid = el('div', { className: 'meta-form-trick-grid' });
        list.forEach(t => {
            const chip = el('button', {
                className: 'meta-form-trick-chip',
                type: 'button',
                dataset: { trickId: t.id },
                onClick: () => {
                    if (selected.has(t.id)) {
                        selected.delete(t.id);
                        chip.classList.remove('is-selected');
                    } else {
                        selected.add(t.id);
                        chip.classList.add('is-selected');
                    }
                    updateConfirmState();
                }
            }, t.name);
            grid.appendChild(chip);
        });
        tricksContainer.appendChild(grid);
    });
    card.appendChild(tricksContainer);

    // footer
    const footer = el('div', { className: 'meta-form-footer' });

    const cancelBtn = el('button', {
        className: 'meta-form-btn meta-form-cancel',
        type: 'button',
        onClick: () => closeForm(overlay)
    }, 'CANCELAR');
    footer.appendChild(cancelBtn);

    const confirmBtn = el('button', {
        className: 'meta-form-btn meta-form-confirm',
        type: 'button',
        disabled: '',
        onClick: () => {
            if (selected.size === 0) return;
            addGoal(type, Array.from(selected), noteInput.value.trim());
            closeForm(overlay);
            refreshLists(screen, data);
        }
    }, 'CRIAR META');
    footer.appendChild(confirmBtn);

    function updateConfirmState() {
        if (selected.size === 0) {
            confirmBtn.setAttribute('disabled', '');
        } else {
            confirmBtn.removeAttribute('disabled');
        }
    }

    card.appendChild(footer);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    document.body.classList.add('is-meta-form-open');

    // ESC fecha
    const onKey = (e) => { if (e.key === 'Escape') closeForm(overlay); };
    document.addEventListener('keydown', onKey);
    overlay._onKey = onKey;

    // foco no textarea
    requestAnimationFrame(() => noteInput.focus());
}

function closeForm(overlay) {
    if (overlay._onKey) document.removeEventListener('keydown', overlay._onKey);
    overlay.classList.add('is-closing');
    setTimeout(() => {
        overlay.remove();
        document.body.classList.remove('is-meta-form-open');
    }, 180);
}

/* =========================================================
   HELPERS
   ========================================================= */

function labelForType(type) {
    const labels = { daily: 'DIÁRIA', weekly: 'SEMANAL', monthly: 'MENSAL' };
    return labels[type] || type.toUpperCase();
}

function deadlineLabel(goal) {
    const now = Date.now();
    const exp = new Date(goal.expiresAt).getTime();
    const diff = exp - now;

    if (diff < 0) {
        // expirada
        const daysAgo = Math.floor(-diff / (24 * 60 * 60 * 1000));
        if (daysAgo === 0) return 'expirou hoje';
        if (daysAgo === 1) return 'expirou ontem';
        return `expirou há ${daysAgo}d`;
    }

    const hours = Math.floor(diff / (60 * 60 * 1000));
    const days = Math.floor(hours / 24);

    if (days === 0) {
        if (hours === 0) return 'resta menos de 1h';
        return `resta${hours === 1 ? '' : 'm'} ${hours}h`;
    }
    return `resta${days === 1 ? '' : 'm'} ${days}d`;
}

/* =========================================================
   LINHAS — RENDER
   ========================================================= */

function findTrick(data, trickId) {
    return data.tricks.find(t => t.id === trickId);
}

function renderLineOfTheDay(screen, data) {
    const wrap = el('section', { className: 'metas-line-wrap', id: 'metas-line-day' });
    wrap.appendChild(el('h3', { className: 'metas-line-subtitle' }, 'LINHA DO DIA (recomendada)'));

    const eligibleCount = linesEngine.eligibleTricks(data).length;
    if (eligibleCount === 0) {
        wrap.appendChild(el('p', { className: 'metas-line-empty' },
            'sem manobras com progresso ≥ 2 ainda. anota teu progresso no catálogo pra desbloquear sugestões.'
        ));
        return wrap;
    }

    const cached = linesEngine.getOrGenerateLineOfTheDay(data);
    renderLineBody(wrap, screen, data, cached, true);
    return wrap;
}

function renderLineBody(wrap, screen, data, lineState, isOfTheDay) {
    /* área da linha */
    const linebox = el('div', { className: 'metas-line-box' });

    if (lineState.completedAt && isOfTheDay) {
        linebox.appendChild(el('div', { className: 'metas-line-done-stamp' }, 'CONSEGUI ✓'));
    }

    const trickRow = el('div', { className: 'metas-line-tricks' });
    lineState.trickIds.forEach((tid, i) => {
        const t = findTrick(data, tid);
        const name = t ? t.name : tid;
        const chip = el('button', {
            className: 'metas-line-trick',
            type: 'button',
            onClick: () => openReplaceDialog(screen, data, i, lineState.trickIds, () => refreshLineOfTheDay(screen, data))
        }, name);
        trickRow.appendChild(chip);
        if (i < lineState.trickIds.length - 1) {
            trickRow.appendChild(el('span', { className: 'metas-line-arrow' }, '→'));
        }
    });
    linebox.appendChild(trickRow);

    /* botões de ação */
    const actions = el('div', { className: 'metas-line-actions' });

    if (isOfTheDay) {
        if (lineState.trickIds.length < 7) {
            actions.appendChild(el('button', {
                className: 'metas-line-btn metas-line-add', type: 'button',
                onClick: () => {
                    const r = linesEngine.addOneToLine(data, lineState.trickIds);
                    if (r.error) flashToast(r.error);
                    refreshLineOfTheDay(screen, data);
                }
            }, '+1 manobra'));
        }

        actions.appendChild(el('button', {
            className: 'metas-line-btn', type: 'button',
            onClick: () => {
                const r = linesEngine.regenerateLineOfTheDay(data);
                if (r.error) flashToast(r.error);
                refreshLineOfTheDay(screen, data);
            }
        }, '↻ outra'));

        if (!lineState.completedAt) {
            actions.appendChild(el('button', {
                className: 'metas-line-btn metas-line-done', type: 'button',
                onClick: () => {
                    linesEngine.markLineCompleted();
                    refreshLineOfTheDay(screen, data);
                }
            }, 'CONSEGUI ✓'));
        }
    }

    linebox.appendChild(actions);
    wrap.appendChild(linebox);
}

function refreshLineOfTheDay(screen, data) {
    const old = screen.querySelector('#metas-line-day');
    if (!old) return;
    const fresh = renderLineOfTheDay(screen, data);
    old.replaceWith(fresh);
}

function openReplaceDialog(screen, data, index, currentIds, onDone) {
    const overlay = el('div', {
        className: 'metas-line-overlay',
        onClick: (e) => { if (e.target === overlay) overlay.remove(); }
    });
    const card = el('div', { className: 'metas-line-overlay-card' });
    card.appendChild(el('h3', {}, 'trocar manobra'));
    card.appendChild(el('p', { className: 'metas-line-overlay-hint' }, 'escolhe uma manobra do catálogo:'));

    const list = el('div', { className: 'metas-line-replace-list' });
    data.tricks.forEach(t => {
        if (currentIds[index] === t.id) return; // a atual
        const isUsed = currentIds.includes(t.id);
        const avg = getProgressAverage(t.id);
        const btn = el('button', {
            className: `metas-line-replace-btn${isUsed ? ' is-used' : ''}${avg < 2 ? ' is-low' : ''}`,
            type: 'button',
            disabled: isUsed ? '' : null,
            onClick: () => {
                linesEngine.replaceTrickInLine(currentIds, index, t.id);
                overlay.remove();
                onDone();
            }
        }, el('span', {}, t.name),
           el('span', { className: 'metas-line-replace-prog' }, 'progresso ' + avg));
        list.appendChild(btn);
    });
    card.appendChild(list);

    /* botão remover */
    const removeBtn = el('button', {
        className: 'metas-line-btn metas-line-btn-danger', type: 'button',
        onClick: () => {
            const r = linesEngine.removeTrickFromLine(index);
            overlay.remove();
            if (r && r.error) flashToast(r.error);
            else onDone();
        }
    }, 'remover dessa linha');
    card.appendChild(removeBtn);

    card.appendChild(el('button', {
        className: 'metas-line-btn', type: 'button',
        onClick: () => overlay.remove()
    }, 'cancelar'));

    overlay.appendChild(card);
    document.body.appendChild(overlay);
}

function renderUserLines(screen, data) {
    const wrap = el('section', { className: 'metas-line-wrap', id: 'metas-line-user' });
    wrap.appendChild(el('h3', { className: 'metas-line-subtitle' }, 'SUAS LINHAS'));

    const userLines = getUserLines();
    if (userLines.length === 0) {
        wrap.appendChild(el('p', { className: 'metas-line-empty' }, 'nenhuma linha sua ainda. cria uma:'));
    } else {
        userLines.slice().reverse().forEach(line => {
            const card = el('div', { className: 'metas-line-box metas-line-box-user' });
            const titleRow = el('div', { className: 'metas-line-user-title' });
            titleRow.appendChild(el('strong', {}, line.name || '(sem nome)'));
            if (line.completedAt) {
                titleRow.appendChild(el('span', { className: 'metas-line-user-completed' }, '✓'));
            }
            card.appendChild(titleRow);
            const tr = el('div', { className: 'metas-line-tricks' });
            line.trickIds.forEach((tid, i) => {
                const t = findTrick(data, tid);
                tr.appendChild(el('span', { className: 'metas-line-trick metas-line-trick-static' }, t ? t.name : tid));
                if (i < line.trickIds.length - 1) tr.appendChild(el('span', { className: 'metas-line-arrow' }, '→'));
            });
            card.appendChild(tr);

            const acts = el('div', { className: 'metas-line-actions' });
            if (!line.completedAt) {
                acts.appendChild(el('button', {
                    className: 'metas-line-btn metas-line-done', type: 'button',
                    onClick: () => {
                        markUserLineCompleted(line.id);
                        refreshUserLines(screen, data);
                    }
                }, 'CONSEGUI ✓'));
            }
            acts.appendChild(el('button', {
                className: 'metas-line-btn metas-line-btn-danger', type: 'button',
                onClick: () => {
                    if (!confirm('apagar essa linha?')) return;
                    deleteUserLine(line.id);
                    refreshUserLines(screen, data);
                }
            }, 'apagar'));
            card.appendChild(acts);
            wrap.appendChild(card);
        });
    }

    /* botão criar */
    wrap.appendChild(el('button', {
        className: 'metas-line-btn metas-line-create-user', type: 'button',
        onClick: () => openCreateUserLine(screen, data)
    }, '+ criar linha'));

    return wrap;
}

function refreshUserLines(screen, data) {
    const old = screen.querySelector('#metas-line-user');
    if (!old) return;
    const fresh = renderUserLines(screen, data);
    old.replaceWith(fresh);
}

function openCreateUserLine(screen, data) {
    const overlay = el('div', {
        className: 'metas-line-overlay',
        onClick: (e) => { if (e.target === overlay) overlay.remove(); }
    });
    const card = el('div', { className: 'metas-line-overlay-card' });
    card.appendChild(el('h3', {}, 'nova linha'));

    const nameInput = el('input', {
        type: 'text', className: 'metas-line-input',
        placeholder: 'nome (ex: linha do banco)', maxLength: 40
    });
    card.appendChild(nameInput);

    card.appendChild(el('p', { className: 'metas-line-overlay-hint' }, 'escolhe as manobras (clique pra adicionar):'));
    const selected = [];
    const selectedView = el('div', { className: 'metas-line-tricks metas-line-selected-tricks' });
    const renderSelected = () => {
        selectedView.innerHTML = '';
        selected.forEach((tid, i) => {
            const t = findTrick(data, tid);
            const chip = el('button', {
                className: 'metas-line-trick metas-line-selected-chip',
                type: 'button',
                onClick: () => { selected.splice(i, 1); renderSelected(); }
            }, (t ? t.name : tid) + ' ✕');
            selectedView.appendChild(chip);
            if (i < selected.length - 1) selectedView.appendChild(el('span', { className: 'metas-line-arrow' }, '→'));
        });
    };
    card.appendChild(selectedView);

    const trickList = el('div', { className: 'metas-line-replace-list' });
    data.tricks.forEach(t => {
        const avg = getProgressAverage(t.id);
        trickList.appendChild(el('button', {
            className: `metas-line-replace-btn${avg < 2 ? ' is-low' : ''}`,
            type: 'button',
            onClick: () => {
                if (selected.length >= 7) { flashToast('máximo 7'); return; }
                if (selected.includes(t.id)) return;
                selected.push(t.id);
                renderSelected();
            }
        }, el('span', {}, t.name),
           el('span', { className: 'metas-line-replace-prog' }, 'progresso ' + avg)));
    });
    card.appendChild(trickList);

    const btnRow = el('div', { className: 'metas-line-actions' });
    btnRow.appendChild(el('button', {
        className: 'metas-line-btn', type: 'button',
        onClick: () => overlay.remove()
    }, 'cancelar'));
    btnRow.appendChild(el('button', {
        className: 'metas-line-btn metas-line-done', type: 'button',
        onClick: () => {
            if (selected.length === 0) { flashToast('escolhe pelo menos 1 manobra'); return; }
            saveUserLine({
                name: nameInput.value.trim() || 'sua linha',
                trickIds: selected.slice()
            });
            overlay.remove();
            refreshUserLines(screen, data);
        }
    }, 'salvar'));
    card.appendChild(btnRow);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
}

function renderHistoricLines(linesData) {
    const wrap = el('section', { className: 'metas-line-wrap' });
    wrap.appendChild(el('h3', { className: 'metas-line-subtitle' }, 'LINHAS LENDÁRIAS'));

    if (!linesData.lines || linesData.lines.length === 0) {
        wrap.appendChild(el('p', { className: 'metas-line-empty' }, 'em breve.'));
    } else {
        linesData.lines.forEach(line => {
            const card = el('div', { className: 'metas-line-box metas-line-box-historic' });
            const head = el('div', { className: 'metas-line-historic-head' });
            head.appendChild(el('strong', { className: 'metas-line-historic-skater' }, line.skater));
            head.appendChild(el('span', { className: 'metas-line-historic-meta' },
                ` · ${line.video} · ${line.year}`));
            card.appendChild(head);

            if (line.spot) {
                card.appendChild(el('p', { className: 'metas-line-historic-spot' }, line.spot));
            }

            const tr = el('div', { className: 'metas-line-historic-tricks' });
            line.tricks.forEach((t, i) => {
                tr.appendChild(el('span', { className: 'metas-line-historic-trick' }, t));
                if (i < line.tricks.length - 1) {
                    tr.appendChild(el('span', { className: 'metas-line-arrow' }, '→'));
                }
            });
            card.appendChild(tr);

            if (line.context) {
                card.appendChild(el('p', { className: 'metas-line-historic-context' }, line.context));
            }
            if (line.tribute) {
                card.appendChild(el('blockquote', { className: 'metas-line-historic-tribute' }, '"' + line.tribute + '"'));
            }
            wrap.appendChild(card);
        });
    }

    /* botão pra tela de Manobras Históricas */
    wrap.appendChild(el('button', {
        className: 'metas-line-btn metas-historic-btn', type: 'button',
        onClick: () => navigate('historicTricks')
    }, '→ MANOBRAS HISTÓRICAS'));

    return wrap;
}

function flashToast(text) {
    const t = el('div', { className: 'toast' }, text);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
}

export default { render };
