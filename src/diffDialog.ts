import joplin from 'api';
import { _ } from './i18n';
import { computeLineDiff, reconstructText } from './diffUtils';

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
    };

    const html = `
        <div id="diff-dialog-container">
            <form name="diffForm" id="diffForm">
                <div id="diff-app"></div>
                <input type="hidden" name="diffAction" id="diffAction" value="">
                <input type="hidden" name="diffFinalText" id="diffFinalText" value="">
                <input type="hidden" name="diffDecisionsJson" id="diffDecisionsJson" value="">
                <input type="hidden" id="diffDataJson" value="${escapeHtml(JSON.stringify(diffResult))}">
                <input type="hidden" id="diffTranslationsJson" value="${escapeHtml(JSON.stringify(translations))}">
            </form>
        </div>
    `;

    await joplin.views.dialogs.setHtml(diffDialogHandle, html);
    await joplin.views.dialogs.setButtons(diffDialogHandle, [
        { id: 'replaceNoteBody', title: _('replaceNoteBody') },
        { id: 'diffCancel', title: _('diffCancel') }
    ]);

    const result = await joplin.views.dialogs.open(diffDialogHandle);

    if (result.id === 'replaceNoteBody') {
        const formData = result.formData?.diffForm;
        let finalText = formData?.diffFinalText;

        // Fallback: decisionsJson 기반으로 안전하게 본문 재구성
        if (typeof finalText !== 'string' || finalText === '') {
            try {
                const decisions = formData?.diffDecisionsJson ? JSON.parse(formData.diffDecisionsJson) : {};
                finalText = reconstructText(diffResult, decisions, 'rejected');
            } catch (e) {
                console.error('Failed to reconstruct fallback diff text', e);
            }
        }

        if (typeof finalText === 'string') {
            // Joplin Editor Command를 통한 Undo 가능한 본문 교체
            await joplin.commands.execute('editor.execCommand', {
                name: 'selectAll',
            });
            await joplin.commands.execute('editor.execCommand', {
                name: 'replaceSelection',
                args: [finalText],
            });
            return { action: 'applied' };
        }
    }

    return { action: 'cancelled' };
}
