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
    responseHandling: 'status' | 'full';
}

export async function registerSettings(onOpenManager?: () => Promise<void>) {
    await joplin.settings.registerSection('joplin2n8n', {
        label: _('pluginName'),
        iconName: 'fas fa-paper-plane',
        description: _('settingsSectionDesc'),
    });

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
        }
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
