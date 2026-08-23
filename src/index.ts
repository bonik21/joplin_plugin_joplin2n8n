import joplin from 'api';
import { MenuItemLocation, ToolbarButtonLocation } from 'api/types';
import { initI18n, _ } from './i18n';
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
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };

        if (webhook.authType === 'basic' && webhook.basicUser && webhook.basicPass) {
            const authString = Buffer.from(`${webhook.basicUser}:${webhook.basicPass}`).toString('base64');
            headers['Authorization'] = `Basic ${authString}`;
        } else if (webhook.authType === 'header' && webhook.headerAuth) {
            headers['Authorization'] = webhook.headerAuth;
        }

        const response = await fetch(webhook.url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(note)
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
