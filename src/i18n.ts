import joplin from 'api';
const en = require('./locales/en.json');
const ko = require('./locales/ko.json');

const locales: Record<string, any> = {
    en,
    ko,
};

let currentLocale = 'en';

export async function initI18n() {
    const joplinLocale = await joplin.settings.globalValue('locale');
    if (joplinLocale && joplinLocale.startsWith('ko')) {
        currentLocale = 'ko';
    } else {
        currentLocale = 'en';
    }
}

export function _(key: string, ...args: any[]): string {
    let text = locales[currentLocale]?.[key] || locales['en']?.[key] || key;
    if (args.length > 0) {
        for (const arg of args) {
            text = text.replace('%s', String(arg));
        }
    }
    return text;
}
