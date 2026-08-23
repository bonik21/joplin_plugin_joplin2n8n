import joplin from 'api';
import { MenuItemLocation, ToolbarButtonLocation } from 'api/types';
import { initI18n, _ } from './i18n';
const fs = joplin.require('fs-extra');

function buildMultipartFormData(boundary: string, fields: Record<string, string>, files: { name: string, filename: string, buffer: Buffer, mime: string }[]): Buffer {
    const buffers: Buffer[] = [];
    
    // Add text fields
    for (const [key, value] of Object.entries(fields)) {
        buffers.push(Buffer.from(`--${boundary}\r\n`));
        buffers.push(Buffer.from(`Content-Disposition: form-data; name="${key}"\r\n\r\n`));
        buffers.push(Buffer.from(`${value}\r\n`));
    }
    
    // Add files
    for (const file of files) {
        buffers.push(Buffer.from(`--${boundary}\r\n`));
        buffers.push(Buffer.from(`Content-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\n`));
        buffers.push(Buffer.from(`Content-Type: ${file.mime}\r\n\r\n`));
        buffers.push(file.buffer);
        buffers.push(Buffer.from(`\r\n`));
    }
    
    // End boundary
    buffers.push(Buffer.from(`--${boundary}--\r\n`));
    
    return Buffer.concat(buffers);
}
import { registerSettings, getWebhooks, Webhook } from './settings';
import { openWebhookManager } from './managerDialog';

const registeredCommandIds = new Set<string>();
let htmlDialogHandle = '';

async function executeWebhook(webhook: Webhook) {
    const note = await joplin.workspace.selectedNote();
    if (!note) {
        await joplin.views.dialogs.showMessageBox(_('errorNoNoteSelected'));
        return;
    }

    try {
        const headers: Record<string, string> = {};

        if (webhook.authType === 'basic' && webhook.basicUser && webhook.basicPass) {
            const authString = Buffer.from(`${webhook.basicUser}:${webhook.basicPass}`).toString('base64');
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

        const files: { name: string, filename: string, buffer: Buffer, mime: string }[] = [];
        let modifiedBody = note.body;

        for (const id of resourceIds) {
            try {
                const resource = await joplin.data.get(['resources', id], { fields: ['id', 'title', 'mime'] });
                const filePath = await joplin.data.resourcePath(id);
                const buffer = await fs.readFile(filePath);
                
                const filename = resource.title || id;
                files.push({
                    name: id,
                    filename: filename,
                    buffer: buffer,
                    mime: resource.mime || 'application/octet-stream'
                });
                
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

        const boundary = '----Joplin2n8nBoundary' + Math.random().toString(16).substring(2);
        headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;

        const fields: Record<string, string> = {};
        for (const [key, value] of Object.entries(note)) {
            if (typeof value === 'object' || Array.isArray(value)) {
                fields[key] = JSON.stringify(value);
            } else {
                fields[key] = String(value);
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
        fields['tag'] = JSON.stringify(tags);

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
        fields['notebook'] = notebookNames.join('|');

        const payload = buildMultipartFormData(boundary, fields, files);

        const response = await fetch(webhook.url, {
            method: 'POST',
            headers: headers,
            body: payload
        });

        if (webhook.responseHandling === 'text') {
            const text = await response.text();
            await joplin.views.dialogs.showMessageBox(`Response (${response.status}):\n\n${text}`);
        } else if (webhook.responseHandling === 'html') {
            const html = await response.text();
            await joplin.views.dialogs.setHtml(htmlDialogHandle, `<div style="padding: 10px; user-select: text;">${html}</div>`);
            await joplin.views.dialogs.open(htmlDialogHandle);
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
            
            // Context menu doesn't support sub-menus well, so add them individually
            try {
                await joplin.views.menuItems.create(`${commandId}_ctx`, commandId, MenuItemLocation.NoteListContextMenu);
            } catch (e) {
                console.warn(e);
            }

            // Add to Toolbar individually
            try {
                await joplin.views.toolbarButtons.create(`${commandId}_tb`, commandId, ToolbarButtonLocation.NoteToolbar);
            } catch (e) {
                console.warn(e);
            }
        }
        
        menuItems.push({ commandName: commandId });
        index++;
    }
    
    // Always add the settings command
    menuItems.push({ commandName: 'joplin2n8n.openManager' });

    // Tools menu supports submenus
    if (menuItems.length > 0) {
        try {
            await joplin.views.menus.create('joplin2n8n_tools_menu', 'joplin2n8n', menuItems, MenuItemLocation.Tools);
        } catch (e) {
            console.warn('Could not create/update tools menu (might already exist):', e);
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
    onStart: async function() {
        await initI18n();
        
        // Initialize HTML response dialog
        htmlDialogHandle = await joplin.views.dialogs.create('joplin2n8nHtmlResponse');
        await joplin.views.dialogs.setButtons(htmlDialogHandle, [{ id: 'ok', title: 'OK' }]);
        await joplin.views.dialogs.setFitToContent(htmlDialogHandle, false);

        await registerSettings(async () => {
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
