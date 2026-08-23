import joplin from 'api';
import { MenuItemLocation, ToolbarButtonLocation } from 'api/types';
import { initI18n, _ } from './i18n';
import { registerSettings, getWebhooks, Webhook } from './settings';
import { openWebhookManager } from './managerDialog';

const registeredCommandIds = new Set<string>();

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

        if (webhook.responseHandling === 'full') {
            const text = await response.text();
            await joplin.views.dialogs.showMessageBox(`Response (${response.status}):\n\n${text}`);
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
                await openWebhookManager(updateDynamicMenu);
            },
        });
        registeredCommandIds.add(managerCommandId);
        
        // Add to Tools menu: Tools -> joplin2n8n 설정 변경
        await joplin.views.menuItems.create('joplin2n8n_openManager_tools', managerCommandId, MenuItemLocation.Tools);
    }
}

joplin.plugins.register({
    onStart: async function() {
        await initI18n();
        await registerSettings(async () => {
            await openWebhookManager(updateDynamicMenu);
        });
        await registerBaseCommands();
        await updateDynamicMenu();
    },
});
