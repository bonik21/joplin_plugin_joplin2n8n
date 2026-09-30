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

function hasAnyDecisionMade() {
    return Object.values(decisions).some(d => d === 'accepted' || d === 'rejected');
}

function updateToolbarButtons() {
    const btnApply = getElement('btn-diff-apply');
    const btnDiscard = getElement('btn-diff-discard');
    if (!btnApply || !btnDiscard) return;

    const anyChosen = hasAnyDecisionMade();
    if (anyChosen) {
        btnApply.textContent = t.diffApplyRest || '나머지 변경사항 적용 후 노트 본문 교체';
        btnDiscard.textContent = t.diffDiscardRest || '나머지 변경사항 취소 후 노트 본문 교체';
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

function getMyButtonBar() {
    try {
        const parentDoc = window.parent && window.parent.document;
        if (!parentDoc) return null;

        let myIframe = null;
        if (window.frameElement) {
            myIframe = window.frameElement;
        } else {
            const iframes = parentDoc.querySelectorAll('iframe');
            for (const f of iframes) {
                try {
                    if (f.contentWindow === window) {
                        myIframe = f;
                        break;
                    }
                } catch (e) {}
            }
        }

        if (myIframe) {
            const container = myIframe.closest('.modal-dialog') || myIframe.closest('.modal-content') || myIframe.parentElement;
            if (container) {
                return container.querySelector('.user-dialog-button-bar');
            }
        }
    } catch (e) {
        console.warn('Could not locate button bar', e);
    }
    return null;
}

function removeLegacyHideStyle() {
    try {
        const parentDoc = window.parent && window.parent.document;
        if (parentDoc) {
            const legacy = parentDoc.getElementById('joplin2n8n-diff-hide-btn-bar');
            if (legacy) legacy.remove();
        }
    } catch (e) {}
}

function hideDiffButtonBar() {
    removeLegacyHideStyle();
    const bar = getMyButtonBar();
    if (bar) {
        bar.style.display = 'none';
    }
}

function restoreDiffButtonBar() {
    removeLegacyHideStyle();
    const bar = getMyButtonBar();
    if (bar) {
        bar.style.display = '';
    }
}

function submitDiffResult(action, unresolvedFallback) {
    const actionInput = getElement('diffAction');
    const textInput = getElement('diffFinalText');
    const decisionsInput = getElement('diffDecisionsJson');

    if (actionInput) actionInput.value = action;
    if (decisionsInput) decisionsInput.value = JSON.stringify(decisions);

    if (action === 'apply' || action === 'discard') {
        const finalText = reconstruct(unresolvedFallback);
        if (textInput) textInput.value = finalText;
    }

    // 부모 문서의 Joplin 버튼 클릭을 통해 다이얼로그 닫기
    try {
        const bar = getMyButtonBar();
        if (bar) {
            const btn = bar.querySelector('button');
            if (btn) {
                restoreDiffButtonBar();
                btn.click();
                return;
            }
        }
        const parentDoc = window.parent && window.parent.document;
        if (parentDoc) {
            const btn = parentDoc.querySelector('.user-dialog-button-bar button');
            if (btn) {
                restoreDiffButtonBar();
                btn.click();
                return;
            }
        }
    } catch (e) {
        console.warn('Could not click parent button', e);
    }

    restoreDiffButtonBar();
    const form = getElement('diffForm');
    if (form) form.submit();
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

            const linesHtml = (hunk.lines || []).map(line => {
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

            return `
                <div class="diff-hunk-card status-pending" id="diff-hunk-${hunk.id}">
                    <div class="diff-hunk-header">
                        <div class="diff-hunk-meta">
                            <span class="diff-badge ${badgeClass}">${badgeText}</span>
                            <span class="diff-badge-status status-pending">${t.diffStatusPending || '미선택'}</span>
                            <span class="diff-hunk-lines-info">${t.diffBefore || '수정 전'} L${hunk.oldStartLine} / ${t.diffAfter || '수정 후'} L${hunk.newStartLine}</span>
                        </div>
                        <div class="diff-hunk-actions">
                            <button type="button" class="diff-hunk-btn btn-hunk-apply" data-hunk-id="${hunk.id}">
                                ✓ ${t.diffApplyHunk || '적용'}
                            </button>
                            <button type="button" class="diff-hunk-btn btn-hunk-discard" data-hunk-id="${hunk.id}">
                                ✕ ${t.diffDiscardHunk || '취소'}
                            </button>
                        </div>
                    </div>
                    <div class="diff-lines-table">
                        ${linesHtml}
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
                        <span class="diff-stat-count">${hunkCount} ${t.diffHunksUnit || '변경사항'}</span>
                        <span class="diff-stat-add">+${addedCount}</span>
                        <span class="diff-stat-del">-${deletedCount}</span>
                    </div>
                </div>
                <div class="diff-toolbar-actions">
                    <button type="button" class="diff-btn btn-primary" id="btn-diff-apply">
                        ${escapeHtml(t.diffApplyAll || '전체 적용')}
                    </button>
                    <button type="button" class="diff-btn btn-secondary" id="btn-diff-discard">
                        ${escapeHtml(t.diffDiscardAll || '전체 취소')}
                    </button>
                    <button type="button" class="diff-btn" id="btn-diff-reset">
                        ${escapeHtml(t.diffReset || '적용 초기화')}
                    </button>
                    <button type="button" class="diff-btn btn-danger-outline" id="btn-diff-cancel">
                        ${escapeHtml(t.diffCancel || '변경사항 비교 취소')}
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
        });
    });

    // 2. 개별 Hunk 취소 버튼
    document.querySelectorAll('.btn-hunk-discard').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const hunkId = parseInt(e.currentTarget.getAttribute('data-hunk-id'), 10);
            decisions[hunkId] = 'rejected';
            updateHunkCardUI(hunkId);
            updateToolbarButtons();
        });
    });

    // 3. 상단 적용 버튼 (전체 적용 or 나머지 변경사항 적용 후 노트 본문 교체)
    const btnApply = getElement('btn-diff-apply');
    if (btnApply) {
        btnApply.addEventListener('click', () => {
            submitDiffResult('apply', 'accepted');
        });
    }

    // 4. 상단 취소 버튼 (전체 취소 or 나머지 변경사항 취소 후 노트 본문 교체)
    const btnDiscard = getElement('btn-diff-discard');
    if (btnDiscard) {
        btnDiscard.addEventListener('click', () => {
            submitDiffResult('discard', 'rejected');
        });
    }

    // 5. 적용 초기화
    const btnReset = getElement('btn-diff-reset');
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            (diffResult.hunks || []).forEach(h => {
                decisions[h.id] = 'pending';
                updateHunkCardUI(h.id);
            });
            updateToolbarButtons();
        });
    }

    // 6. 변경사항 비교 취소
    const btnCancel = getElement('btn-diff-cancel');
    if (btnCancel) {
        btnCancel.addEventListener('click', () => {
            submitDiffResult('cancel', 'rejected');
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
    } catch (e) {
        console.error('Error parsing diff initial data', e);
    }

    if (diffResult && diffResult.hunks) {
        diffResult.hunks.forEach(h => {
            decisions[h.id] = 'pending';
        });
    }

    // 현재 다이얼로그의 버튼 바만 안전하게 숨김 (전역 style 주입 금지)
    hideDiffButtonBar();
    window.addEventListener('beforeunload', restoreDiffButtonBar);
    window.addEventListener('unload', restoreDiffButtonBar);

    renderDiff();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
