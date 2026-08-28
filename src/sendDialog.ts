import joplin from 'api';
import { getWebhooks, Webhook } from './settings';
import { _ } from './i18n';

let sendDialogHandle: string | null = null;

export async function openSendDialog(onSelect: (hook: Webhook) => Promise<void>) {
    const currentHooks = await getWebhooks();
    if (currentHooks.length === 0) {
        await joplin.views.dialogs.showMessageBox(_('noWebhooksConfigured'));
        return;
    }
    if (currentHooks.length === 1) {
        await onSelect(currentHooks[0]);
        return;
    }

    if (!sendDialogHandle) {
        sendDialogHandle = await joplin.views.dialogs.create('joplin2n8nSendDialog');
        await joplin.views.dialogs.addScript(sendDialogHandle, './webview/sendDialog.js');
        await joplin.views.dialogs.addScript(sendDialogHandle, './webview/sendDialog.css');
        await joplin.views.dialogs.setFitToContent(sendDialogHandle, true);
    }

    let lastUsedWebhookId = '';
    let dialogWidth = 600;
    let dialogHeight = 500;
    try {
        lastUsedWebhookId = await joplin.settings.value('lastUsedWebhookId');
        dialogWidth = await joplin.settings.value('dialogWidth') || 600;
        dialogHeight = await joplin.settings.value('dialogHeight') || 500;
    } catch (e) {
        // Ignore
    }

    let optionsHtml = '';
    for (const hook of currentHooks) {
        const isSelected = hook.id === lastUsedWebhookId ? ' selected' : '';
        optionsHtml += `<option value="${hook.id}"${isSelected}>${hook.title || 'n8n'}</option>`;
    }
    const totalHooks = currentHooks.length;
    const selectSize = Math.min(totalHooks, 8);

    const html = `
        <style>
            body { min-width: ${dialogWidth}px; }
            .webhook-select { max-height: ${dialogHeight}px; }
        </style>
        <form name="sendForm" id="sendForm">
            <div class="send-dialog">
                <div class="header">
                    <h3>${_('sendToN8n')}</h3>
                </div>
                <div class="form-group">
                    <select name="webhookId" id="webhookId" class="webhook-select" size="${selectSize}">
                        ${optionsHtml}
                    </select>
                </div>
            </div>
        </form>
    `;

    await joplin.views.dialogs.setHtml(sendDialogHandle, html);
    await joplin.views.dialogs.setButtons(sendDialogHandle, [
        { id: 'ok', title: 'OK' },
        { id: 'cancel', title: _('cancel') }
    ]);

    const result = await joplin.views.dialogs.open(sendDialogHandle);
    if (result.id === 'ok' && result.formData && result.formData.sendForm && result.formData.sendForm.webhookId) {
        const selectedId = result.formData.sendForm.webhookId;
        const hook = currentHooks.find(w => w.id === selectedId);
        if (hook) {
            await onSelect(hook);
        }
    }
}
