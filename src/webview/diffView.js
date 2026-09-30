// Webview script for Diff View Dialog (Line-based Unified Diff)

let diffResult = null;
let t = {};
let decisions = {}; // { [hunkId: number]: 'pending' | 'accepted' | 'rejected' }
let expandedHunks = {}; // { [hunkId: number]: boolean }

function getElement(id) {
    return document.getElementById(id);
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showWebviewToast(message, isError) {
    let toast = document.getElementById('joplin2n8n-diff-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'joplin2n8n-diff-toast';
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.className = isError ? 'diff-toast-error' : 'diff-toast-success';
    toast.style.display = 'block';

    // Force reflow for smooth transition
    void toast.offsetHeight;
    toast.classList.add('visible');

    if (window.__diffToastTimeout) {
        clearTimeout(window.__diffToastTimeout);
    }

    window.__diffToastTimeout = setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => {
            if (!toast.classList.contains('visible')) {
                toast.style.display = 'none';
            }
        }, 250);
    }, 2500);
}

function highlightPendingHunks() {
    try {
        const pendingHunks = document.querySelectorAll('.diff-hunk.status-pending');
        if (pendingHunks && pendingHunks.length > 0) {
            pendingHunks[0].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            pendingHunks.forEach(hunkEl => {
                hunkEl.classList.remove('hunk-pending-pulse');
                void hunkEl.offsetWidth; // force reflow
                hunkEl.classList.add('hunk-pending-pulse');
            });
            setTimeout(() => {
                pendingHunks.forEach(hunkEl => {
                    hunkEl.classList.remove('hunk-pending-pulse');
                });
            }, 1100);
        }
    } catch (e) {}
}

function hasAnyPendingHunk() {
    if (!diffResult || !diffResult.hunks || diffResult.hunks.length === 0) return false;
    return diffResult.hunks.some(h => (decisions[h.id] || 'pending') === 'pending');
}

function hasAnyDecisionMade() {
    return Object.values(decisions).some(d => d === 'accepted' || d === 'rejected');
}

function updateToolbarButtons() {
    const btnApply = getElement('btn-diff-apply');
    const btnDiscard = getElement('btn-diff-discard');
    if (!btnApply || !btnDiscard) return;

    const anyChosen = hasAnyDecisionMade();
    if (anyChosen) {
        btnApply.textContent = t.diffApplyRest || "나머지를 '적용'으로 선택";
        btnDiscard.textContent = t.diffDiscardRest || "나머지를 '취소'로 선택";
    } else {
        btnApply.textContent = t.diffApplyAll || '전체 적용';
        btnDiscard.textContent = t.diffDiscardAll || '전체 취소';
    }
}

function getSectionTooltips(hunk, decision, isExpanded) {
    if (hunk.type === 'add') {
        if (decision === 'pending') {
            return { after: '클릭하여 추가 적용' };
        } else if (decision === 'accepted') {
            return { after: '클릭하여 추가 취소' };
        } else {
            return { after: '클릭하여 추가 적용' };
        }
    }

    if (hunk.type === 'delete') {
        if (decision === 'pending') {
            return { before: '클릭하여 삭제 적용' };
        } else if (decision === 'accepted') {
            return { before: '클릭하여 삭제 취소 (기존 유지)' };
        } else {
            return { before: '클릭하여 삭제 적용' };
        }
    }

    // Modify 타입
    if (decision === 'pending') {
        return {
            before: "클릭하여 '수정 전' 유지 (취소)",
            after: "클릭하여 '수정 후' 적용"
        };
    } else if (decision === 'accepted') {
        if (!isExpanded) {
            return {
                after: "클릭하여 '수정 전' 내용 펼치기"
            };
        } else {
            return {
                before: "클릭하여 '수정 전' 유지 (취소)로 변경",
                after: "클릭하여 '수정 전' 내용 다시 접기"
            };
        }
    } else if (decision === 'rejected') {
        if (!isExpanded) {
            return {
                before: "클릭하여 '수정 후' 내용 펼치기"
            };
        } else {
            return {
                before: "클릭하여 '수정 후' 내용 다시 접기",
                after: "클릭하여 '수정 후' 적용으로 변경"
            };
        }
    }

    return { before: '', after: '' };
}

function updateHunkUI(hunkId) {
    const hunkEl = getElement(`diff-hunk-${hunkId}`);
    if (!hunkEl) return;

    const hunk = (diffResult.hunks || []).find(h => h.id === hunkId);
    if (!hunk) return;

    const decision = decisions[hunkId] || 'pending';
    const isExpanded = !!expandedHunks[hunkId];

    hunkEl.className = `diff-hunk hunk-type-${hunk.type} status-${decision}${isExpanded ? ' is-expanded' : ''}`;

    const beforeEl = hunkEl.querySelector('.diff-section-before');
    const afterEl = hunkEl.querySelector('.diff-section-after');
    const tooltips = getSectionTooltips(hunk, decision, isExpanded);

    if (hunk.type === 'modify') {
        let isBeforeFolded = false;
        let isAfterFolded = false;

        if (decision === 'accepted') {
            isBeforeFolded = !isExpanded;
        } else if (decision === 'rejected') {
            isAfterFolded = !isExpanded;
        }

        if (beforeEl) {
            beforeEl.classList.toggle('folded', isBeforeFolded);
            if (tooltips.before) beforeEl.setAttribute('title', tooltips.before);
            else beforeEl.removeAttribute('title');
        }

        if (afterEl) {
            afterEl.classList.toggle('folded', isAfterFolded);
            if (tooltips.after) afterEl.setAttribute('title', tooltips.after);
            else afterEl.removeAttribute('title');
        }
    } else {
        if (beforeEl && tooltips.before) beforeEl.setAttribute('title', tooltips.before);
        if (afterEl && tooltips.after) afterEl.setAttribute('title', tooltips.after);
    }
}

function handleSectionClick(hunkId, sectionType) {
    const hunk = (diffResult.hunks || []).find(h => h.id === hunkId);
    if (!hunk) return;

    const currentDecision = decisions[hunkId] || 'pending';
    const isExpanded = !!expandedHunks[hunkId];

    // 단일 영역 hunk (add 또는 delete)
    if (hunk.type === 'add') {
        if (currentDecision === 'pending') {
            decisions[hunkId] = 'accepted';
        } else if (currentDecision === 'accepted') {
            decisions[hunkId] = 'rejected';
        } else {
            decisions[hunkId] = 'accepted';
        }
        expandedHunks[hunkId] = false;
        updateHunkUI(hunkId);
        updateToolbarButtons();
        syncFormData();
        return;
    }

    if (hunk.type === 'delete') {
        if (currentDecision === 'pending') {
            decisions[hunkId] = 'accepted';
        } else if (currentDecision === 'accepted') {
            decisions[hunkId] = 'rejected';
        } else {
            decisions[hunkId] = 'accepted';
        }
        expandedHunks[hunkId] = false;
        updateHunkUI(hunkId);
        updateToolbarButtons();
        syncFormData();
        return;
    }

    // Modify 타입
    if (currentDecision === 'pending') {
        // 미선택 상태에서 클릭:
        if (sectionType === 'after') {
            // '수정 후' 선택 -> '적용'
            decisions[hunkId] = 'accepted';
            expandedHunks[hunkId] = false; // 수정 전 접기
        } else {
            // '수정 전' 선택 -> '취소'
            decisions[hunkId] = 'rejected';
            expandedHunks[hunkId] = false; // 수정 후 접기
        }
    } else if (currentDecision === 'accepted') {
        if (!isExpanded) {
            // '수정 후'를 선택해서 '수정 전'이 접힌 상태에서 수정 후 body를 한번 더 클릭하면 다시 펼치기
            expandedHunks[hunkId] = true;
        } else {
            // 이미 펼쳐진 상태에서:
            if (sectionType === 'after') {
                // 수정 후 body를 선택하면 다시 접기
                expandedHunks[hunkId] = false;
            } else {
                // 수정 전 body를 선택하면 선택이 수정 전으로 변경되고 수정 후를 접기
                decisions[hunkId] = 'rejected';
                expandedHunks[hunkId] = false;
            }
        }
    } else if (currentDecision === 'rejected') {
        if (!isExpanded) {
            // '수정 전'을 선택해서 '수정 후'가 접힌 상태에서 수정 전 body를 한번 더 클릭하면 다시 펼치기
            expandedHunks[hunkId] = true;
        } else {
            // 이미 펼쳐진 상태에서:
            if (sectionType === 'before') {
                // 수정 전 body를 선택하면 다시 접기
                expandedHunks[hunkId] = false;
            } else {
                // 수정 후 body를 선택하면 선택이 수정 후로 변경되고 수정 전을 접기
                decisions[hunkId] = 'accepted';
                expandedHunks[hunkId] = false;
            }
        }
    }

    updateHunkUI(hunkId);
    updateToolbarButtons();
    syncFormData();
}

function reconstruct(unresolvedFallback) {
    if (!diffResult || !diffResult.allSegments) return '';
    const resultLines = [];
    const hunkMap = new Map((diffResult.hunks || []).map(h => [h.id, h]));

    for (const seg of diffResult.allSegments) {
        if (seg.type === 'equal' && Array.isArray(seg.lines)) {
            resultLines.push(...seg.lines);
        } else if (seg.type === 'hunk' && seg.hunkId !== undefined) {
            const hunk = hunkMap.get(seg.hunkId);
            if (!hunk) continue;

            let decision = decisions[hunk.id] || 'pending';
            if (decision === 'pending') {
                decision = unresolvedFallback;
            }

            if (decision === 'accepted') {
                if (hunk.type === 'modify' || hunk.type === 'add') {
                    resultLines.push(...(hunk.newLines || []));
                }
            } else {
                if (hunk.type === 'modify' || hunk.type === 'delete') {
                    resultLines.push(...(hunk.oldLines || []));
                }
            }
        }
    }

    return resultLines.join('\n');
}

/**
 * 변경 상태를 hidden input에 실시간 동기화
 */
function syncFormData() {
    const textInput = getElement('diffFinalText');
    const decisionsInput = getElement('diffDecisionsJson');

    if (decisionsInput) {
        decisionsInput.value = JSON.stringify(decisions);
    }
    if (textInput) {
        textInput.value = reconstruct('rejected');
    }
}

function isDiffButtonBar(buttonBar) {
    if (!buttonBar) return false;
    const cancelText = (t.diffCancel || '').trim();
    const buttons = buttonBar.querySelectorAll('button');
    if (!buttons || buttons.length === 0) return false;
    return Array.from(buttons).some(b => {
        const txt = (b.textContent || '').trim();
        return (cancelText && txt === cancelText) ||
            txt.includes('비교') ||
            txt.includes('Comparison') ||
            txt.includes('comparaison');
    });
}

function checkPendingAndBlock(e, buttonElement) {
    const text = (buttonElement.textContent || '').trim();
    const cancelText = (t.diffCancel || '').trim();

    // '변경사항 비교 취소' 버튼은 가로채지 않고 정상 통과
    if ((cancelText && text === cancelText) ||
        (text.includes('취소') && text.includes('비교')) ||
        (text.includes('Cancel') && text.includes('Comparison')) ||
        (text.includes('Annuler') && text.includes('comparaison'))) {
        return;
    }

    // '복사', '삽입', '노트 본문 교체'인 경우 미선택 항목 검사!
    if (hasAnyPendingHunk()) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        showWebviewToast(t.diffHasPendingItems || '선택하지 않은 항목이 있습니다.', true);
        highlightPendingHunks();
        return false;
    }
}

/**
 * 부모 창의 하단 버튼 바 클릭 시 미선택 항목 검사 및 차단
 */
function attachParentButtonGuards() {
    try {
        const parentDoc = window.parent && window.parent.document;
        if (!parentDoc || parentDoc === document) return;

        if (!parentDoc.__joplin2n8n_diff_doc_guard) {
            parentDoc.__joplin2n8n_diff_doc_guard = function(e) {
                try {
                    const target = e.target;
                    if (!target || typeof target.closest !== 'function') return;

                    const btn = target.closest('button');
                    if (!btn) return;

                    const bar = btn.closest('.user-dialog-button-bar');
                    if (!bar || !isDiffButtonBar(bar)) return;

                    checkPendingAndBlock(e, btn);
                } catch (err) {}
            };
            parentDoc.addEventListener('click', parentDoc.__joplin2n8n_diff_doc_guard, true);
        }

        const buttonBars = parentDoc.querySelectorAll('.user-dialog-button-bar');
        buttonBars.forEach(bar => {
            if (!isDiffButtonBar(bar)) return;

            if (!bar.__joplin2n8n_diff_guard) {
                bar.__joplin2n8n_diff_guard = true;
                bar.addEventListener('click', function(e) {
                    const btn = e.target.closest('button');
                    if (btn) checkPendingAndBlock(e, btn);
                }, true);
            }

            bar.querySelectorAll('button').forEach(btn => {
                if (!btn.__joplin2n8n_diff_guard) {
                    btn.__joplin2n8n_diff_guard = true;
                    btn.addEventListener('click', function(e) {
                        checkPendingAndBlock(e, btn);
                    }, true);
                }
            });
        });

        if (!window.__diff_unload_registered) {
            window.__diff_unload_registered = true;
            window.addEventListener('unload', function() {
                try {
                    if (parentDoc && parentDoc.__joplin2n8n_diff_doc_guard) {
                        parentDoc.removeEventListener('click', parentDoc.__joplin2n8n_diff_doc_guard, true);
                        delete parentDoc.__joplin2n8n_diff_doc_guard;
                    }
                } catch (e) {}
            });
        }
    } catch (e) {
        console.warn('Could not attach parent button guards', e);
    }
}

function renderDiff() {
    const app = getElement('diff-app');
    if (!app) return;

    const hunks = diffResult.hunks || [];
    const allSegments = diffResult.allSegments || [];
    const addedCount = diffResult.addedCount || 0;
    const deletedCount = diffResult.deletedCount || 0;
    const hunkCount = hunks.length;

    let contentHtml = '';
    if (hunkCount === 0 && allSegments.length === 0) {
        contentHtml = `
            <div class="diff-empty-msg">
                ${escapeHtml(t.diffNoChanges || '기존 내용과 응답 내용 사이에 변경사항이 없습니다.')}
            </div>
        `;
    } else {
        const hunkMap = new Map(hunks.map(h => [h.id, h]));
        const segmentHtmlList = [];

        for (const seg of allSegments) {
            if (seg.type === 'equal') {
                // 전후 변화가 없는 텍스트 라인 렌더링
                const eqLines = seg.equalLines || (seg.lines || []).map(txt => ({ text: txt }));
                const eqRowsHtml = eqLines.map(line => `
                    <div class="diff-line-row line-equal">
                        <div class="diff-line-num diff-line-num-old">${line.oldLineNum !== undefined ? line.oldLineNum : ''}</div>
                        <div class="diff-line-num diff-line-num-new">${line.newLineNum !== undefined ? line.newLineNum : ''}</div>
                        <div class="diff-line-marker">&nbsp;</div>
                        <div class="diff-line-text">${escapeHtml(line.text)}</div>
                    </div>
                `).join('');

                segmentHtmlList.push(eqRowsHtml);
            } else if (seg.type === 'hunk' && seg.hunkId !== undefined) {
                const hunk = hunkMap.get(seg.hunkId);
                if (!hunk) continue;

                const decision = decisions[hunk.id] || 'pending';
                const isExpanded = !!expandedHunks[hunk.id];
                const tooltips = getSectionTooltips(hunk, decision, isExpanded);

                const beforeLines = (hunk.lines || []).filter(l => l.type === 'delete');
                const afterLines = (hunk.lines || []).filter(l => l.type === 'insert');

                let isBeforeFolded = false;
                let isAfterFolded = false;
                if (hunk.type === 'modify') {
                    if (decision === 'accepted') isBeforeFolded = !isExpanded;
                    else if (decision === 'rejected') isAfterFolded = !isExpanded;
                }

                const beforeSectionHtml = beforeLines.length > 0 ? `
                    <div class="diff-hunk-body diff-section-before${isBeforeFolded ? ' folded' : ''}" data-hunk-id="${hunk.id}" data-section="before"${tooltips.before ? ` title="${escapeHtml(tooltips.before)}"` : ''}>
                        ${beforeLines.map(line => `
                            <div class="diff-line-row line-delete">
                                <div class="diff-line-num diff-line-num-old">${line.oldLineNum !== undefined ? line.oldLineNum : ''}</div>
                                <div class="diff-line-num diff-line-num-new"></div>
                                <div class="diff-line-marker">-</div>
                                <div class="diff-line-text">${escapeHtml(line.text)}</div>
                            </div>
                        `).join('')}
                    </div>
                ` : '';

                const afterSectionHtml = afterLines.length > 0 ? `
                    <div class="diff-hunk-body diff-section-after${isAfterFolded ? ' folded' : ''}" data-hunk-id="${hunk.id}" data-section="after"${tooltips.after ? ` title="${escapeHtml(tooltips.after)}"` : ''}>
                        ${afterLines.map(line => `
                            <div class="diff-line-row line-insert">
                                <div class="diff-line-num diff-line-num-old"></div>
                                <div class="diff-line-num diff-line-num-new">${line.newLineNum !== undefined ? line.newLineNum : ''}</div>
                                <div class="diff-line-marker">+</div>
                                <div class="diff-line-text">${escapeHtml(line.text)}</div>
                            </div>
                        `).join('')}
                    </div>
                ` : '';

                segmentHtmlList.push(`
                    <div class="diff-hunk hunk-type-${hunk.type} status-${decision}${isExpanded ? ' is-expanded' : ''}" id="diff-hunk-${hunk.id}" data-hunk-id="${hunk.id}">
                        ${beforeSectionHtml}
                        ${afterSectionHtml}
                    </div>
                `);
            }
        }

        contentHtml = `
            <div class="diff-line-view">
                ${segmentHtmlList.join('')}
            </div>
        `;
    }

    app.innerHTML = `
        <div class="diff-wrapper">
            <div class="diff-toolbar">
                <div class="diff-toolbar-info">
                    <h3 class="diff-toolbar-title">${escapeHtml(t.diffTitle || '변경사항 비교')}</h3>
                    <div class="diff-stats">
                        <span class="diff-stat-count">${hunkCount} ${escapeHtml(t.diffHunksUnit || '변경사항')}</span>
                        <span class="diff-stat-add">+${addedCount}</span>
                        <span class="diff-stat-del">-${deletedCount}</span>
                    </div>
                </div>
                <div class="diff-toolbar-actions">
                    <button type="button" class="diff-btn" id="btn-diff-apply">
                        ${escapeHtml(hasAnyDecisionMade() ? (t.diffApplyRest || "나머지를 '적용'으로 선택") : (t.diffApplyAll || '전체 적용'))}
                    </button>
                    <button type="button" class="diff-btn" id="btn-diff-discard">
                        ${escapeHtml(hasAnyDecisionMade() ? (t.diffDiscardRest || "나머지를 '취소'로 선택") : (t.diffDiscardAll || '전체 취소'))}
                    </button>
                    <button type="button" class="diff-btn" id="btn-diff-reset">
                        ${escapeHtml(t.diffReset || '적용 초기화')}
                    </button>
                </div>
            </div>
            <div class="diff-content-scroll">
                ${contentHtml}
            </div>
        </div>
    `;

    // diff-hunk-body 클릭 이벤트 리스너 (이벤트 위임 방식)
    const lineView = app.querySelector('.diff-line-view');
    if (lineView) {
        lineView.addEventListener('click', (e) => {
            const bodyEl = e.target.closest('.diff-hunk-body');
            if (!bodyEl) return;

            const hunkId = parseInt(bodyEl.getAttribute('data-hunk-id'), 10);
            const section = bodyEl.getAttribute('data-section');
            if (!isNaN(hunkId) && section) {
                handleSectionClick(hunkId, section);
            }
        });
    }

    // 상단 툴바 버튼 이벤트 리스너
    // 1. 전체 적용 (또는 나머지를 '적용'으로 선택)
    const btnApply = getElement('btn-diff-apply');
    if (btnApply) {
        btnApply.addEventListener('click', () => {
            const anyChosen = hasAnyDecisionMade();
            (diffResult.hunks || []).forEach(h => {
                if (!anyChosen || decisions[h.id] === 'pending') {
                    decisions[h.id] = 'accepted';
                    expandedHunks[h.id] = false;
                    updateHunkUI(h.id);
                }
            });
            updateToolbarButtons();
            syncFormData();
        });
    }

    // 2. 전체 취소 (또는 나머지를 '취소'로 선택)
    const btnDiscard = getElement('btn-diff-discard');
    if (btnDiscard) {
        btnDiscard.addEventListener('click', () => {
            const anyChosen = hasAnyDecisionMade();
            (diffResult.hunks || []).forEach(h => {
                if (!anyChosen || decisions[h.id] === 'pending') {
                    decisions[h.id] = 'rejected';
                    expandedHunks[h.id] = false;
                    updateHunkUI(h.id);
                }
            });
            updateToolbarButtons();
            syncFormData();
        });
    }

    // 3. 적용 초기화
    const btnReset = getElement('btn-diff-reset');
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            (diffResult.hunks || []).forEach(h => {
                decisions[h.id] = 'pending';
                expandedHunks[h.id] = false;
                updateHunkUI(h.id);
            });
            updateToolbarButtons();
            syncFormData();
        });
    }
}

function init() {
    try {
        const diffDataEl = getElement('diffDataJson');
        if (diffDataEl && diffDataEl.value) {
            diffResult = JSON.parse(diffDataEl.value);
        }
        const transDataEl = getElement('diffTranslationsJson');
        if (transDataEl && transDataEl.value) {
            t = JSON.parse(transDataEl.value);
        }
        const decisionsEl = getElement('diffDecisionsJson');
        if (decisionsEl && decisionsEl.value) {
            decisions = JSON.parse(decisionsEl.value);
        }
    } catch (e) {
        console.error('Error parsing diff initial data', e);
    }

    if (diffResult && diffResult.hunks) {
        diffResult.hunks.forEach(h => {
            if (!decisions[h.id]) {
                decisions[h.id] = 'pending';
            }
        });
    }

    renderDiff();
    syncFormData();

    // 부모 창 하단 버튼 가드 연결 (미선택 시 클릭 차단 및 토스트 표시)
    attachParentButtonGuards();
    setTimeout(attachParentButtonGuards, 50);
    setTimeout(attachParentButtonGuards, 150);
    setTimeout(attachParentButtonGuards, 300);
    setTimeout(attachParentButtonGuards, 600);
    setTimeout(attachParentButtonGuards, 1200);

    // 백엔드에서 전달된 자동 토스트 메시지가 있으면 표시
    const autoToastEl = getElement('diffAutoToast');
    if (autoToastEl && autoToastEl.value) {
        showWebviewToast(autoToastEl.value, true);
        highlightPendingHunks();
        autoToastEl.value = '';
    }
}

attachParentButtonGuards();
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        attachParentButtonGuards();
        init();
    });
} else {
    init();
}
window.addEventListener('load', attachParentButtonGuards);
