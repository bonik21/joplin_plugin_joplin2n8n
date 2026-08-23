import joplin from 'api';
import { getWebhooks, setWebhooks } from './settings';
import { _ } from './i18n';

let dialogHandle: string | null = null;

export async function openWebhookManager(onSave?: () => Promise<void>) {
    if (!dialogHandle) {
        dialogHandle = await joplin.views.dialogs.create('webhookManagerDialog');
        await joplin.views.dialogs.addScript(dialogHandle, './webview/manager.js');
        await joplin.views.dialogs.addScript(dialogHandle, './webview/manager.css');
        await joplin.views.dialogs.setFitToContent(dialogHandle, true);
    }
    
    const webhooks = await getWebhooks();
    
    const translations = {
        title: _('settingsButton'),
        addWebhook: _('addNewWebhook'),
        webhookTitle: _('webhookTitle'),
        webhookUrl: _('webhookUrl'),
        authType: _('authType'),
        authNone: _('authNone'),
        authBasic: _('authBasic'),
        authHeader: _('authHeader'),
        headerPreview: _('headerPreview'),
        responseHandling: _('responseHandling'),
        responseStatus: _('responseStatus'),
        responseText: _('responseText'),
        responseHtml: _('responseHtml'),
        attachmentHandling: _('attachmentHandling'),
        attachmentKeepId: _('attachmentKeepId'),
        attachmentReplaceName: _('attachmentReplaceName'),
        delete: _('delete'),
    };
    
    function escapeHtml(unsafe: string) {
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }

    const html = `
        <form name="webhook-form" id="webhook-form">
            <div id="app"></div>
            <input type="hidden" name="webhooksJson" id="webhooksJson">
            <input type="hidden" id="initialData" value="${escapeHtml(JSON.stringify(webhooks))}">
            <input type="hidden" id="translationsData" value="${escapeHtml(JSON.stringify(translations))}">
        </form>
    `;
    
    await joplin.views.dialogs.setHtml(dialogHandle, html);
    await joplin.views.dialogs.setButtons(dialogHandle, [
        { id: 'ok', title: _('save') },
        { id: 'cancel', title: _('cancel') }
    ]);

    const result = await joplin.views.dialogs.open(dialogHandle);
    if (result.id === 'ok' && result.formData && result.formData['webhook-form']) {
        try {
            const newWebhooksJson = result.formData['webhook-form'].webhooksJson;
            if (newWebhooksJson) {
                const parsed = JSON.parse(newWebhooksJson);
                await setWebhooks(parsed);
                if (onSave) {
                    await onSave();
                }
            }
        } catch (e) {
            console.error('Error saving webhooks', e);
        }
    }
}
