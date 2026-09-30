// Webview script for Diff View Dialog

let diffResult = null;
let t = {};
let decisions = {}; // { [hunkId: number]: 'pending' | 'accepted' | 'rejected' }

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
        const pendingHunks = document.querySelectorAll('.diff-hunk-card.status-pending');
        if (pendingHunks && pendingHunks.length > 0) {
            pendingHunks[0].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            pendingHunks.forEach(card => {
                card.classList.remove('hunk-pending-pulse');
                void card.offsetWidth; // force reflow
                card.classList.add('hunk-pending-pulse');
            });
            setTimeout(() => {
                pendingHunks.forEach(card => {
                    card.classList.remove('hunk-pending-pulse');
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

function updateHunkCardUI(hunkId) {
    const card = getElement(`diff-hunk-${hunkId}`);
    if (!card) return;

    const decision = decisions[hunkId] || 'pending';
    card.classList.remove('status-pending', 'status-accepted', 'status-rejected');
    card.classList.add(`status-${decision}`);

    const badgeStatus = card.querySelector('.diff-badge-status');
    if (badgeStatus) {
        badgeStatus.className = `diff-badge-status status-${decision}`;
        if (decision === 'accepted') {
            badgeStatus.textContent = t.diffStatusAccepted || '적용됨';
        } else if (decision === 'rejected') {
            badgeStatus.textContent = t.diffStatusRejected || '취소됨';
        } else {
            badgeStatus.textContent = t.diffStatusPending || '미선택';
        }
    }
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
 * (사용자가 하단 '노트 본문 교체' 버튼을 클릭했을 때 전달됨)
 */
function syncFormData() {
    const textInput = getElement('diffFinalText');
    const decisionsInput = getElement('diffDecisionsJson');

    if (decisionsInput) {
        decisionsInput.value = JSON.stringify(decisions);
    }
    if (textInput) {
        // 미선택된 항목은 기본적으로 'rejected'(기존 내용 유지)로 계산
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
 * 부모 창의 하단 버튼 바(복사, 삽입, 노트 본문 교체) 클릭 시 미선택 항목 검사 및 토스트 표시
 * - 부모 document 레벨에서 캡처 단계(capture phase)로 가로채어 조플린의 다이얼로그 닫기 동작을 원천 차단함
 * - 창이 깜빡이거나 닫혔다 열리지 않고 현재 다이얼로그에서 토스트 메시지만 표시됨
 */
function attachParentButtonGuards() {
    try {
        const parentDoc = window.parent && window.parent.document;
        if (!parentDoc || parentDoc === document) return;

        // 1. parentDoc 레벨에서 캡처 단계 리스너 등록
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

        // 2. 현재 존재하는 buttonBar 및 button 요소에 직접 캡처 리스너 등록
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

        // 3. iframe 언로드 시 리스너 정리
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
    const addedCount = diffResult.addedCount || 0;
    const deletedCount = diffResult.deletedCount || 0;
    const hunkCount = hunks.length;

    let contentHtml = '';
    if (hunkCount === 0) {
        contentHtml = `
            <div class="diff-empty-msg">
                ${escapeHtml(t.diffNoChanges || '기존 노트와 응답 내용 사이에 변경사항이 없습니다.')}
            </div>
        `;
    } else {
        contentHtml = hunks.map(hunk => {
            let badgeClass = 'badge-modify';
            let badgeText = t.diffModify || '수정';
            if (hunk.type === 'add') {
                badgeClass = 'badge-add';
                badgeText = t.diffAdd || '추가';
            } else if (hunk.type === 'delete') {
                badgeClass = 'badge-delete';
                badgeText = t.diffDelete || '삭제';
            }

            const beforeLines = (hunk.lines || []).filter(l => l.type === 'delete');
            const afterLines = (hunk.lines || []).filter(l => l.type === 'insert');

            const renderLineRows = (lines) => lines.map(line => {
                const isInsert = line.type === 'insert';
                const rowClass = isInsert ? 'line-insert' : 'line-delete';
                const marker = isInsert ? '+' : '-';
                const lineNum = isInsert ? (line.newLineNum || '') : (line.oldLineNum || '');
                return `
                    <div class="diff-line-row ${rowClass}">
                        <div class="diff-line-num">${lineNum}</div>
                        <div class="diff-line-marker">${marker}</div>
                        <div class="diff-line-text">${escapeHtml(line.text)}</div>
                    </div>
                `;
            }).join('');

            const beforeSectionHtml = beforeLines.length > 0 ? `
                <div class="diff-section diff-section-before">
                    <div class="diff-section-label">${escapeHtml(t.diffBefore || '수정 전')}</div>
                    <div class="diff-lines-table">
                        ${renderLineRows(beforeLines)}
                    </div>
                </div>
            ` : '';

            const afterSectionHtml = afterLines.length > 0 ? `
                <div class="diff-section diff-section-after">
                    <div class="diff-section-label">${escapeHtml(t.diffAfter || '수정 후')}</div>
                    <div class="diff-lines-table">
                        ${renderLineRows(afterLines)}
                    </div>
                </div>
            ` : '';

            const currentDecision = decisions[hunk.id] || 'pending';
            let statusText = t.diffStatusPending || '미선택';
            if (currentDecision === 'accepted') statusText = t.diffStatusAccepted || '적용됨';
            else if (currentDecision === 'rejected') statusText = t.diffStatusRejected || '취소됨';

            return `
                <div class="diff-hunk-card status-${currentDecision}" id="diff-hunk-${hunk.id}">
                    <div class="diff-hunk-header">
                        <div class="diff-hunk-meta">
                            <span class="diff-badge ${badgeClass}">${badgeText}</span>
                            <span class="diff-badge-status status-${currentDecision}">${statusText}</span>
                            <span class="diff-hunk-lines-info">${escapeHtml(t.diffBefore || '수정 전')} L${hunk.oldStartLine} / ${escapeHtml(t.diffAfter || '수정 후')} L${hunk.newStartLine}</span>
                        </div>
                        <div class="diff-hunk-actions">
                            <button type="button" class="diff-hunk-btn btn-hunk-apply" data-hunk-id="${hunk.id}">
                                ✓ ${escapeHtml(t.diffApplyHunk || '적용')}
                            </button>
                            <button type="button" class="diff-hunk-btn btn-hunk-discard" data-hunk-id="${hunk.id}">
                                ✕ ${escapeHtml(t.diffDiscardHunk || '취소')}
                            </button>
                        </div>
                    </div>
                    <div class="diff-hunk-body">
                        ${beforeSectionHtml}
                        ${afterSectionHtml}
                    </div>
                </div>
            `;
        }).join('');
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
                    <button type="button" class="diff-btn btn-primary" id="btn-diff-apply">
                        ${escapeHtml(hasAnyDecisionMade() ? (t.diffApplyRest || "나머지를 '적용'으로 선택") : (t.diffApplyAll || '전체 적용'))}
                    </button>
                    <button type="button" class="diff-btn btn-secondary" id="btn-diff-discard">
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

    // 이벤트 리스너 등록
    // 1. 개별 Hunk 적용 버튼
    document.querySelectorAll('.btn-hunk-apply').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const hunkId = parseInt(e.currentTarget.getAttribute('data-hunk-id'), 10);
            decisions[hunkId] = 'accepted';
            updateHunkCardUI(hunkId);
            updateToolbarButtons();
            syncFormData();
        });
    });

    // 2. 개별 Hunk 취소 버튼
    document.querySelectorAll('.btn-hunk-discard').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const hunkId = parseInt(e.currentTarget.getAttribute('data-hunk-id'), 10);
            decisions[hunkId] = 'rejected';
            updateHunkCardUI(hunkId);
            updateToolbarButtons();
            syncFormData();
        });
    });

    // 3. 상단 버튼: '전체 적용' / "나머지를 '적용'으로 선택" (선택만 변경)
    const btnApply = getElement('btn-diff-apply');
    if (btnApply) {
        btnApply.addEventListener('click', () => {
            const anyChosen = hasAnyDecisionMade();
            (diffResult.hunks || []).forEach(h => {
                if (!anyChosen || decisions[h.id] === 'pending') {
                    decisions[h.id] = 'accepted';
                    updateHunkCardUI(h.id);
                }
            });
            updateToolbarButtons();
            syncFormData();
        });
    }

    // 4. 상단 버튼: '전체 취소' / "나머지를 '취소'로 선택" (선택만 변경)
    const btnDiscard = getElement('btn-diff-discard');
    if (btnDiscard) {
        btnDiscard.addEventListener('click', () => {
            const anyChosen = hasAnyDecisionMade();
            (diffResult.hunks || []).forEach(h => {
                if (!anyChosen || decisions[h.id] === 'pending') {
                    decisions[h.id] = 'rejected';
                    updateHunkCardUI(h.id);
                }
            });
            updateToolbarButtons();
            syncFormData();
        });
    }

    // 5. 상단 버튼: '적용 초기화' (모든 선택항목을 미선택으로 되돌리기)
    const btnReset = getElement('btn-diff-reset');
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            (diffResult.hunks || []).forEach(h => {
                decisions[h.id] = 'pending';
                updateHunkCardUI(h.id);
            });
            updateToolbarButtons();
            syncFormData();
        });
    }
}

function init() {
    // 잔존 숨김 스타일 제거 (방어 코드)
    try {
        const parentDoc = window.parent && window.parent.document;
        if (parentDoc) {
            const legacy = parentDoc.getElementById('joplin2n8n-diff-hide-btn-bar');
            if (legacy) legacy.remove();
        }
    } catch (e) {}

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

    // 부모 창 하단 버튼 가드 연결 (미선택 시 클릭 방지 및 토스트 표시)
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

// 스크립트 로드 시 즉시 및 이벤트 시점마다 가드 등록 시도
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
