import joplin from 'api';
import { _ } from './i18n';
import { computeLineDiff, reconstructText, HunkDecision } from './diffUtils';

let diffDialogHandle: string | null = null;

export interface DiffDialogResult {
    action: 'applied' | 'cancelled';
}

function escapeHtml(str: string): string {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export async function openDiffDialog(oldText: string, newText: string): Promise<DiffDialogResult> {
    const diffResult = computeLineDiff(oldText, newText);

    if (!diffDialogHandle) {
        diffDialogHandle = await joplin.views.dialogs.create('joplin2n8nDiffDialog');
        await joplin.views.dialogs.addScript(diffDialogHandle, './webview/diffView.css');
        await joplin.views.dialogs.addScript(diffDialogHandle, './webview/diffView.js');
        await joplin.views.dialogs.setFitToContent(diffDialogHandle, false);
    }

    const translations = {
        diffTitle: _('diffTitle'),
        diffApplyAll: _('diffApplyAll'),
        diffDiscardAll: _('diffDiscardAll'),
        diffApplyRest: _('diffApplyRest'),
        diffDiscardRest: _('diffDiscardRest'),
        diffReset: _('diffReset'),
        diffCancel: _('diffCancel'),
        diffBefore: _('diffBefore'),
        diffAfter: _('diffAfter'),
        diffApplyHunk: _('diffApplyHunk'),
        diffDiscardHunk: _('diffDiscardHunk'),
        diffStatusPending: _('diffStatusPending'),
        diffStatusAccepted: _('diffStatusAccepted'),
        diffStatusRejected: _('diffStatusRejected'),
        diffNoChanges: _('diffNoChanges'),
        diffModify: _('diffModify'),
        diffAdd: _('diffAdd'),
        diffDelete: _('diffDelete'),
        diffHunksUnit: _('diffHunksUnit'),
        diffHasPendingItems: _('diffHasPendingItems'),
    };

    let currentDecisions: Record<number, HunkDecision> = {};
    let pendingToast = '';

    while (true) {
        const html = `
            <div id="diff-dialog-container">
                <form name="diffForm" id="diffForm">
                    <div id="diff-app"></div>
                    <input type="hidden" name="diffAction" id="diffAction" value="">
                    <input type="hidden" name="diffFinalText" id="diffFinalText" value="">
                    <input type="hidden" name="diffDecisionsJson" id="diffDecisionsJson" value="${escapeHtml(JSON.stringify(currentDecisions))}">
                    <input type="hidden" id="diffDataJson" value="${escapeHtml(JSON.stringify(diffResult))}">
                    <input type="hidden" id="diffTranslationsJson" value="${escapeHtml(JSON.stringify(translations))}">
                    <input type="hidden" id="diffAutoToast" value="${escapeHtml(pendingToast)}">
                </form>
            </div>
        `;
        pendingToast = '';

        await joplin.views.dialogs.setHtml(diffDialogHandle, html);
        await joplin.views.dialogs.setButtons(diffDialogHandle, [
            { id: 'copyToClipboard', title: _('copyToClipboard') },
            { id: 'insertCursor', title: _('insertAtCursor') },
            { id: 'replaceNoteBody', title: _('replaceNoteBody') },
            { id: 'diffCancel', title: _('diffCancel') },
        ]);

        const result = await joplin.views.dialogs.open(diffDialogHandle);

        const formData = result.formData?.diffForm;
        if (formData?.diffDecisionsJson) {
            try {
                currentDecisions = JSON.parse(formData.diffDecisionsJson);
            } catch (e) {}
        }

        const isAction = ['replaceNoteBody', 'copyToClipboard', 'insertCursor'].includes(result.id);
        if (isAction) {
            // 미선택(pending) 항목 검사: '복사', '삽입', '노트 본문 교체' 모두 미선택 항목이 있으면 차단
            const hasPending = diffResult.hunks.some(h => {
                const dec = currentDecisions[h.id] || 'pending';
                return dec === 'pending';
            });

            if (hasPending) {
                pendingToast = _('diffHasPendingItems');
                // showMessageBox 대신 재오픈 시 diffAutoToast를 통해 다이얼로그 내부 토스트로 표시
                continue;
            }

            if (result.id === 'replaceNoteBody') {
                // 모든 항목이 선택되었으므로 최종 본문 재구성
                let finalText = formData?.diffFinalText;
                if (typeof finalText !== 'string' || finalText === '') {
                    finalText = reconstructText(diffResult, currentDecisions, 'rejected');
                }

                // 에디터 포커스 및 딜레이 부여 후 selectAll & replaceSelection
                // (에디터 포커스 부재로 인해 기존 선택영역만 변경되는 현상 방지)
                try {
                    await joplin.commands.execute('editor.focus');
                } catch (e) {}
                await new Promise(resolve => setTimeout(resolve, 60));

                try {
                    await joplin.commands.execute('editor.execCommand', { name: 'selectAll' });
                } catch (e) {
                    await joplin.commands.execute('selectAll');
                }

                await joplin.commands.execute('editor.execCommand', {
                    name: 'replaceSelection',
                    args: [finalText],
                });

                return { action: 'applied' };

            } else if (result.id === 'copyToClipboard') {
                // 1차 다이얼로그와 같은 동작: 응답 본문 클립보드 복사
                await joplin.clipboard.writeText(newText);
                return { action: 'applied' };

            } else if (result.id === 'insertCursor') {
                // 1차 다이얼로그와 같은 동작: 커서 위치에 응답 본문 삽입
                try {
                    await joplin.commands.execute('editor.focus');
                } catch (e) {}
                await new Promise(resolve => setTimeout(resolve, 60));

                await joplin.commands.execute('editor.execCommand', {
                    name: 'replaceSelection',
                    args: [newText],
                });
                return { action: 'applied' };
            }

        } else {
            // 'diffCancel' 또는 창 닫기: 변경사항 폐기 후 기존 다이얼로그로 복귀
            return { action: 'cancelled' };
        }
    }
}
