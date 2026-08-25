import joplin from 'api';
import { SettingItemType } from 'api/types';
import { _ } from './i18n';

export interface Webhook {
    id: string;
    title: string;
    url: string;
    authType: 'none' | 'basic' | 'header';
    basicUser?: string;
    basicPass?: string;
    headerAuth?: string;
    responseHandling: 'status' | 'text' | 'html' | 'file';
    attachmentHandling: 'keep_id' | 'replace_name';
}

export async function registerSettings(platform: 'desktop' | 'mobile', onOpenManager?: () => Promise<void>) {
    await joplin.settings.registerSection('joplin2n8n', {
        label: _('pluginName'),
        iconName: 'fas fa-paper-plane',
        description: _('settingsSectionDesc'),
    });

    const isDesktop = platform === 'desktop';

    await joplin.settings.registerSettings({
        'webhooks': {
            value: '[]',
            type: SettingItemType.String,
            section: 'joplin2n8n',
            public: false,
            label: 'Webhooks Configuration (JSON)',
        },
        'openManagerAction': {
            value: false,
            type: SettingItemType.Bool,
            section: 'joplin2n8n',
            public: true,
            label: _('openManagerOptionLabel'),
            description: _('openManagerOptionDesc'),
        },
        'copyNoteBeforeSend': {
            value: true,
            type: SettingItemType.Bool,
            section: 'joplin2n8n',
            public: true,
            label: _('copyNoteBeforeSendLabel'),
            description: _('copyNoteBeforeSendDesc'),
        },
        'showInContextMenu': {
            value: true,
            type: SettingItemType.Bool,
            section: 'joplin2n8n',
            public: isDesktop,  // Hidden on mobile (not supported)
            label: _('showInContextMenuLabel'),
            description: _('showInContextMenuDesc'),
        },
        'showInNoteToolbar': {
            value: true,
            type: SettingItemType.Bool,
            section: 'joplin2n8n',
            public: true,
            label: isDesktop ? _('showInNoteToolbarLabel') : _('showInNoteToolbarLabelMobile'),
            description: isDesktop ? _('showInNoteToolbarDesc') : _('showInNoteToolbarDescMobile'),
        },
        'showInToolsMenu': {
            value: true,
            type: SettingItemType.Bool,
            section: 'joplin2n8n',
            public: isDesktop,  // Hidden on mobile (not supported)
            label: _('showInToolsMenuLabel'),
            description: _('showInToolsMenuDesc'),
        },
        'showInEditorToolbar': {
            value: true,
            type: SettingItemType.Bool,
            section: 'joplin2n8n',
            public: true,
            label: isDesktop ? _('showInEditorToolbarLabel') : _('showInEditorToolbarLabelMobile'),
            description: isDesktop ? _('showInEditorToolbarDesc') : _('showInEditorToolbarDescMobile'),
        },
    });

    await joplin.settings.onChange(async (event) => {
        if (event.keys.includes('openManagerAction')) {
            const val = await joplin.settings.value('openManagerAction');
            if (val) {
                await joplin.settings.setValue('openManagerAction', false);
                if (onOpenManager) {
                    await onOpenManager();
                }
            }
        }
        const uiKeys = ['showInContextMenu', 'showInNoteToolbar', 'showInToolsMenu', 'showInEditorToolbar'];
        if (uiKeys.some(k => event.keys.includes(k))) {
            await joplin.views.dialogs.showMessageBox(_('restartRequiredToApplyUIChanges'));
        }
    });
}

export async function getWebhooks(): Promise<Webhook[]> {
    const jsonStr = await joplin.settings.value('webhooks');
    try {
        return JSON.parse(jsonStr) || [];
    } catch (e) {
        return [];
    }
}

export async function setWebhooks(webhooks: Webhook[]) {
    await joplin.settings.setValue('webhooks', JSON.stringify(webhooks));
}
