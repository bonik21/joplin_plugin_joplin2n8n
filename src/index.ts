import joplin from 'api';
import { MenuItemLocation, ToolbarButtonLocation } from 'api/types';
import { initI18n, _ } from './i18n';
import { registerSettings, getWebhooks, Webhook } from './settings';
import { openWebhookManager } from './managerDialog';

const registeredCommandIds = new Set<string>();
let htmlDialogHandle = '';
let sendDialogHandle = '';

async function executeWebhook(webhook: Webhook) {
    const note = await joplin.workspace.selectedNote();
    if (!note) {
        await joplin.views.dialogs.showMessageBox(_('errorNoNoteSelected'));
        return;
    }

    const copyNoteBeforeSend = await joplin.settings.value('copyNoteBeforeSend');
    if (copyNoteBeforeSend) {
        try {
            await joplin.clipboard.writeText(note.body);
        } catch (e) {
            console.warn('Failed to copy note body to clipboard', e);
        }
    }

    try {
        const headers: Record<string, string> = {};

        if (webhook.authType === 'basic' && webhook.basicUser && webhook.basicPass) {
            // btoa() is available in both Electron (desktop) and React Native (mobile)
            const authString = btoa(`${webhook.basicUser}:${webhook.basicPass}`);
            headers['Authorization'] = `Basic ${authString}`;
        } else if (webhook.authType === 'header' && webhook.headerAuth) {
            headers['Authorization'] = webhook.headerAuth;
        }

        // Extract resources
        const resourceRegex = /\(:\/([a-f0-9]{32})\)/gi;
        const resourceIds = new Set<string>();
        let match;
        while ((match = resourceRegex.exec(note.body)) !== null) {
            resourceIds.add(match[1]);
        }

        // Use standard FormData — works on both desktop and mobile
        const formData = new FormData();
        let modifiedBody = note.body;

        for (const id of resourceIds) {
            try {
                const resource = await joplin.data.get(['resources', id], { fields: ['id', 'title', 'mime'] });
                const filePath = await joplin.data.resourcePath(id);

                // Use fetch with file:// URL — works on Electron (desktop) and React Native (mobile)
                const normalizedPath = filePath.replace(/\\/g, '/');
                const fileUrl = normalizedPath.startsWith('/') ? `file://${normalizedPath}` : `file:///${normalizedPath}`;
                const fileRes = await fetch(fileUrl);
                const arrayBuffer = await fileRes.arrayBuffer();

                const filename = resource.title || id;
                const mime = resource.mime || 'application/octet-stream';
                const blob = new Blob([arrayBuffer], { type: mime });
                formData.append(id, blob, filename);

                if (webhook.attachmentHandling === 'replace_name') {
                    // Replace Markdown link ID with filename
                    const replaceRegex = new RegExp(`\\(:\\/${id}\\)`, 'g');
                    modifiedBody = modifiedBody.replace(replaceRegex, `(${filename})`);
                }
            } catch (e) {
                console.warn(`Could not load resource ${id}`, e);
            }
        }

        note.body = modifiedBody;

        // Add note fields as text parts
        for (const [key, value] of Object.entries(note)) {
            if (typeof value === 'object' || Array.isArray(value)) {
                formData.append(key, JSON.stringify(value));
            } else {
                formData.append(key, String(value));
            }
        }

        // Fetch tags
        let tags: string[] = [];
        try {
            const tagsResponse = await joplin.data.get(['notes', note.id, 'tags'], { fields: ['title'] });
            if (tagsResponse && tagsResponse.items) {
                tags = tagsResponse.items.map((t: any) => t.title);
            }
        } catch (e) {
            console.warn('Could not fetch tags', e);
        }
        formData.append('tag', JSON.stringify(tags));

        // Fetch notebook path
        const notebookNames: string[] = [];
        let currentFolderId = note.parent_id;
        while (currentFolderId) {
            try {
                const folder = await joplin.data.get(['folders', currentFolderId], { fields: ['id', 'title', 'parent_id'] });
                notebookNames.unshift(folder.title);
                currentFolderId = folder.parent_id || '';
            } catch (e) {
                console.warn('Could not fetch folder', e);
                break;
            }
        }
        formData.append('notebook', notebookNames.join('|'));

        // Do NOT set Content-Type manually — fetch sets it automatically with the correct boundary
        const response = await fetch(webhook.url, {
            method: 'POST',
            headers: headers,
            body: formData
        });

        if (webhook.responseHandling === 'text' || webhook.responseHandling === 'html') {
            const rawResponse = await response.text();
            
            let displayHtml = rawResponse;
            if (webhook.responseHandling === 'text') {
                const escapeHtml = (unsafe: string) => {
                    return unsafe
                        .replace(/&/g, "&amp;")
                        .replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;")
                        .replace(/"/g, "&quot;")
                        .replace(/'/g, "&#039;");
                };
                displayHtml = `<pre style="white-space: pre-wrap; font-family: monospace;">${escapeHtml(rawResponse)}</pre>`;
            }

            await joplin.views.dialogs.setButtons(htmlDialogHandle, [
                { id: 'copyToClipboard', title: _('copyToClipboard') },
                { id: 'replaceNoteBody', title: _('replaceNoteBody') },
                { id: 'ok', title: 'OK' },
            ]);
            await joplin.views.dialogs.setHtml(htmlDialogHandle, `
                <style>
                    html, body {
                        margin: 0;
                        padding: 0;
                        height: 100%;
                        box-sizing: border-box;
                    }
                    #response-container {
                        padding: 10px;
                        user-select: text;
                        overflow-y: auto;
                        min-width: 700px;
                        max-height: 95vh;
                        box-sizing: border-box;
                        word-break: break-word;
                    }
                </style>
                <div id="response-container">${displayHtml}</div>
            `);
            const dlgResult = await joplin.views.dialogs.open(htmlDialogHandle);

            if (dlgResult.id === 'copyToClipboard') {
                await joplin.clipboard.writeText(rawResponse);
            } else if (dlgResult.id === 'replaceNoteBody') {
                const activeNote = await joplin.workspace.selectedNote();
                if (activeNote && activeNote.id === note.id) {
                    const versionInfo = await joplin.versionInfo();
                    if (versionInfo.platform === 'desktop') {
                        // Desktop: use editor command so Ctrl+Z (undo) works
                        await joplin.commands.execute('editor.execCommand', { name: 'selectAll' });
                        await joplin.commands.execute('replaceSelection', rawResponse);
                    } else {
                        // Mobile: editor commands not supported, write directly to DB
                        await joplin.data.put(['notes', note.id], null, { body: rawResponse });
                    }
                } else {
                    await joplin.views.dialogs.showMessageBox(_('errorNoteMismatch'));
                }
            }

        } else {
            if (response.ok) {
                await joplin.views.dialogs.showMessageBox(_('noteSentSuccess', webhook.title || webhook.url));
            } else {
                await joplin.views.dialogs.showMessageBox(_('noteSentError', webhook.title || webhook.url) + `\nStatus: ${response.status}`);
            }
        }
    } catch (error: any) {
        await joplin.views.dialogs.showMessageBox(_('noteSentError', webhook.title || webhook.url) + `\nError: ${error.message}`);
    }
}

export async function updateDynamicMenu() {
    const webhooks = await getWebhooks();
    const showInContextMenu = await joplin.settings.value('showInContextMenu');
    const showInNoteToolbar = await joplin.settings.value('showInNoteToolbar');
    const showInEditorToolbar = await joplin.settings.value('showInEditorToolbar');
    const showInToolsMenu = await joplin.settings.value('showInToolsMenu');

    let index = 1;
    const menuItems = [];
    for (const hook of webhooks) {
        if (!hook.id) continue;

        const commandId = `joplin2n8n.send_${hook.id}`;

        if (!registeredCommandIds.has(commandId)) {
            const accelerator = index <= 9 ? `CmdOrCtrl+Alt+${index}` : undefined;

            await joplin.commands.register({
                name: commandId,
                label: _('sendToWebhook', hook.title || 'n8n'),
                iconName: 'fas fa-paper-plane',
                ...(accelerator ? { accelerator } : {}),
                execute: async () => {
                    const currentWebhooks = await getWebhooks();
                    const currentHook = currentWebhooks.find(w => w.id === hook.id);
                    if (currentHook) {
                        await executeWebhook(currentHook);
                    } else {
                        await joplin.views.dialogs.showMessageBox(_('webhookNotFound'));
                    }
                },
            });

            registeredCommandIds.add(commandId);

            // Context menu — only register if setting is enabled AND on desktop
            const versionInfoForMenu = await joplin.versionInfo();
            if (showInContextMenu && versionInfoForMenu.platform === 'desktop') {
                try {
                    await joplin.views.menuItems.create(`${commandId}_ctx`, commandId, MenuItemLocation.NoteListContextMenu);
                } catch (e) {
                    console.warn(e);
                }
            }

            // Note toolbar — only register if setting is enabled
            if (showInNoteToolbar) {
                try {
                    await joplin.views.toolbarButtons.create(`${commandId}_tb`, commandId, ToolbarButtonLocation.NoteToolbar);
                } catch (e) {
                    console.warn(e);
                }
            }
        }

        menuItems.push({ commandName: commandId });
        index++;
    }

    // Editor Toolbar Button (Mobile Bottom Toolbar integration)
    const mobileSendCmdId = 'joplin2n8n.mobileSend';
    if (!registeredCommandIds.has(mobileSendCmdId)) {
        await joplin.commands.register({
            name: mobileSendCmdId,
            label: _('sendToN8n'),
            iconName: 'fas fa-paper-plane',
            execute: async () => {
                const currentHooks = await getWebhooks();
                if (currentHooks.length === 0) {
                    await joplin.views.dialogs.showMessageBox(_('noWebhooksConfigured'));
                    return;
                }
                if (currentHooks.length === 1) {
                    await executeWebhook(currentHooks[0]);
                    return;
                }
                let optionsHtml = '';
                for (const hook of currentHooks) {
                    optionsHtml += `<option value="${hook.id}">${hook.title || 'n8n'}</option>`;
                }
                const html = `
                    <form name="sendForm">
                        <div style="padding: 10px;">
                            <h3 style="margin-top:0">${_('sendToN8n')}</h3>
                            <select name="webhookId" style="width: 100%; padding: 10px; font-size: 16px;">
                                ${optionsHtml}
                            </select>
                        </div>
                    </form>
                `;
                await joplin.views.dialogs.setHtml(sendDialogHandle, html);
                await joplin.views.dialogs.setButtons(sendDialogHandle, [
                    { id: 'ok', title: 'OK' },
                    { id: 'cancel', title: _('cancel') }
                ]);
                const dlgResult = await joplin.views.dialogs.open(sendDialogHandle);
                if (dlgResult.id === 'ok' && dlgResult.formData && dlgResult.formData.sendForm && dlgResult.formData.sendForm.webhookId) {
                    const selectedId = dlgResult.formData.sendForm.webhookId;
                    const hook = currentHooks.find(w => w.id === selectedId);
                    if (hook) {
                        await executeWebhook(hook);
                    }
                }
            }
        });
        registeredCommandIds.add(mobileSendCmdId);
    }
    
    if (showInEditorToolbar) {
        try {
            await joplin.views.toolbarButtons.create(`${mobileSendCmdId}_etb`, mobileSendCmdId, ToolbarButtonLocation.EditorToolbar);
        } catch (e) {
            console.warn(e);
        }
    }

    // Always add the settings command
    menuItems.push({ commandName: 'joplin2n8n.openManager' });

    // Tools menu — only register if setting is enabled (always include settings command)
    if (showInToolsMenu && menuItems.length > 0) {
        try {
            await joplin.views.menus.create('joplin2n8n_tools_menu', 'joplin2n8n', menuItems, MenuItemLocation.Tools);
        } catch (e) {
            console.warn('Could not create/update tools menu (might already exist):', e);
        }
    } else if (!showInToolsMenu) {
        // Tools menu disabled — still register the settings command in Tools menu so the plugin remains accessible
        try {
            await joplin.views.menus.create('joplin2n8n_tools_menu', 'joplin2n8n', [{ commandName: 'joplin2n8n.openManager' }], MenuItemLocation.Tools);
        } catch (e) {
            console.warn('Could not create tools menu for manager only:', e);
        }
    }
}

async function registerBaseCommands() {
    // Command to open Webhook Manager dialog
    const managerCommandId = 'joplin2n8n.openManager';
    if (!registeredCommandIds.has(managerCommandId)) {
        await joplin.commands.register({
            name: managerCommandId,
            label: _('settingsButton'),
            iconName: 'fas fa-cog',
            execute: async () => {
                const prevWebhooks = await joplin.settings.value('webhooks');
                await openWebhookManager(async () => {
                    await updateDynamicMenu();
                    const newWebhooks = await joplin.settings.value('webhooks');
                    if (prevWebhooks !== newWebhooks) {
                        await joplin.views.dialogs.showMessageBox(_('restartRequiredToApplyUIChanges', '웹훅 설정이 변경되었습니다. 우측 상단 아이콘 및 우클릭 메뉴에 변경사항을 완벽히 적용하려면 Joplin을 재시작해주세요.'));
                    }
                });
            },
        });
        registeredCommandIds.add(managerCommandId);
    }
}

joplin.plugins.register({
    onStart: async function () {
        await initI18n();

        // Initialize HTML response dialog
        htmlDialogHandle = await joplin.views.dialogs.create('joplin2n8nHtmlResponse');
        await joplin.views.dialogs.setButtons(htmlDialogHandle, [{ id: 'ok', title: 'OK' }]);
        await joplin.views.dialogs.setFitToContent(htmlDialogHandle, false);

        // Initialize Send Selection Dialog
        sendDialogHandle = await joplin.views.dialogs.create('joplin2n8nSendDialog');
        await joplin.views.dialogs.setFitToContent(sendDialogHandle, true);

        const versionInfo = await joplin.versionInfo();
        await registerSettings(versionInfo.platform, async () => {
            const prevWebhooks = await joplin.settings.value('webhooks');
            await openWebhookManager(async () => {
                await updateDynamicMenu();
                const newWebhooks = await joplin.settings.value('webhooks');
                if (prevWebhooks !== newWebhooks) {
                    await joplin.views.dialogs.showMessageBox(_('restartRequiredToApplyUIChanges', '웹훅 설정이 변경되었습니다. 우측 상단 아이콘 및 우클릭 메뉴에 변경사항을 완벽히 적용하려면 Joplin을 재시작해주세요.'));
                }
            });
        });
        await registerBaseCommands();
        await updateDynamicMenu();
    },
});
