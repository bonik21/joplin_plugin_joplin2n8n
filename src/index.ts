import joplin from 'api';
import { MenuItemLocation, ToolbarButtonLocation, ToastType } from 'api/types';
import { initI18n, _ } from './i18n';
import { registerSettings, getWebhooks, Webhook } from './settings';
import { openWebhookManager } from './managerDialog';

const registeredCommandIds = new Set<string>();
let htmlDialogHandle = '';
let sendDialogHandle = '';

export interface JoplinInfo {
    platform: string;
    os: string;
    version: string;
    device: string;
    profile: string;
}

async function getJoplinInfo(): Promise<JoplinInfo> {
    let platform = 'unknown';
    let version = 'unknown';

    try {
        const vInfo = await joplin.versionInfo();
        if (vInfo) {
            platform = vInfo.platform || 'unknown';
            version = vInfo.version || 'unknown';
        }
    } catch (e) {
        console.warn('Could not fetch versionInfo', e);
    }

    // Determine OS
    let os = 'unknown';
    if (typeof process !== 'undefined' && process.platform) {
        switch (process.platform) {
            case 'win32': os = 'Windows'; break;
            case 'darwin': os = 'macOS'; break;
            case 'linux': os = 'Linux'; break;
            case 'android': os = 'Android'; break;
            default: os = process.platform;
        }
    }

    if (os === 'unknown' && typeof navigator !== 'undefined' && navigator.userAgent) {
        const ua = navigator.userAgent;
        if (/Android/i.test(ua)) os = 'Android';
        else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
        else if (/Windows/i.test(ua)) os = 'Windows';
        else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
        else if (/Linux/i.test(ua)) os = 'Linux';
    }

    // Determine Device Name
    let device = '';
    try {
        const customDevice = await joplin.settings.value('customDeviceName');
        if (customDevice && typeof customDevice === 'string' && customDevice.trim() !== '') {
            device = customDevice.trim();
        }
    } catch (e) {
        // Ignore
    }

    // If device name not explicitly configured by user
    if (!device) {
        if (platform === 'desktop') {
            // PC: Auto-detect hostname (BONIK-3570K, etc.)
            if (typeof process !== 'undefined' && process.env) {
                device = process.env.COMPUTERNAME || process.env.HOSTNAME || '';
            }
            if (!device) {
                try {
                    const osMod = joplin.require('os');
                    if (osMod && typeof osMod.hostname === 'function') {
                        device = osMod.hostname() || '';
                    }
                } catch (e) {
                    // Ignore
                }
            }
        } else {
            // Mobile: Default is empty string
            device = '';
        }
    }

    // Determine Profile Name
    let profile = '';
    try {
        const customProfile = await joplin.settings.value('customProfileName');
        if (customProfile && typeof customProfile === 'string' && customProfile.trim() !== '') {
            profile = customProfile.trim();
        }
    } catch (e) {
        // Ignore
    }

    // If profile name not explicitly configured by user
    if (!profile) {
        if (platform === 'desktop') {
            // PC: Auto-detect from profiles.json
            try {
                const profileDir = await joplin.settings.globalValue('profileDir');
                let rootProfileDir = '';
                try {
                    rootProfileDir = await joplin.settings.globalValue('rootProfileDir');
                } catch (e) {
                    // Ignore
                }

                const candidatePaths: string[] = [];
                if (rootProfileDir) {
                    const normalizedRoot = String(rootProfileDir).replace(/\\/g, '/').replace(/\/+$/, '');
                    candidatePaths.push(`${normalizedRoot}/profiles.json`);
                }

                let folderId = '';
                let lastPart = '';
                if (profileDir) {
                    const normalized = String(profileDir).replace(/\\/g, '/').replace(/\/+$/, '');
                    const parts = normalized.split('/');
                    lastPart = parts[parts.length - 1] || '';
                    folderId = lastPart.startsWith('profile-') ? lastPart.substring(8) : lastPart;

                    const parentDir = parts.slice(0, -1).join('/');
                    const grandParentDir = parts.slice(0, -2).join('/');

                    if (parentDir) candidatePaths.push(`${parentDir}/profiles.json`);
                    candidatePaths.push(`${normalized}/profiles.json`);
                    if (grandParentDir) candidatePaths.push(`${grandParentDir}/profiles.json`);
                }

                let profileConfig: any = null;
                let fs: any = null;
                try {
                    fs = joplin.require('fs-extra');
                } catch (e) {
                    try {
                        fs = require('fs');
                    } catch (e2) {
                        // Ignore
                    }
                }

                for (const cPath of candidatePaths) {
                    if (profileConfig) break;
                    if (fs) {
                        try {
                            if (fs.existsSync(cPath)) {
                                const raw = fs.readFileSync(cPath, 'utf8');
                                profileConfig = JSON.parse(raw.replace(/^\uFEFF/, ''));
                                break;
                            }
                        } catch (e) {
                            // Ignore
                        }
                    }

                    // Fallback to file:// fetch
                    try {
                        const fileUrl = cPath.startsWith('/') ? `file://${cPath}` : `file:///${cPath}`;
                        const res = await fetch(fileUrl);
                        if (res.ok) {
                            const raw = await res.text();
                            profileConfig = JSON.parse(raw.replace(/^\uFEFF/, ''));
                            break;
                        }
                    } catch (e) {
                        // Ignore
                    }
                }

                if (profileConfig && Array.isArray(profileConfig.profiles)) {
                    const currentId = profileConfig.currentProfileId || folderId;
                    const matched = profileConfig.profiles.find((p: any) =>
                        p.id === folderId ||
                        p.id === currentId ||
                        (folderId && p.id && folderId.includes(p.id)) ||
                        (p.id === 'default' && (lastPart.toLowerCase().includes('joplin') || lastPart === '.joplin'))
                    );
                    if (matched && matched.name) {
                        profile = matched.name;
                    } else if (folderId && folderId !== 'joplin-desktop' && folderId !== '.joplin') {
                        profile = folderId;
                    }
                } else if (lastPart) {
                    if (lastPart.toLowerCase().includes('joplin') || lastPart === '.joplin') {
                        profile = 'default';
                    } else {
                        profile = folderId || '';
                    }
                }
            } catch (e) {
                console.warn('Could not fetch profileDir or profile name', e);
            }
        } else {
            // Mobile: Default is empty string if not configured
            profile = '';
        }
    }

    return {
        platform,
        os,
        version,
        device,
        profile,
    };
}

async function executeWebhook(webhook: Webhook) {
    if (webhook && webhook.id) {
        try {
            await joplin.settings.setValue('lastUsedWebhookId', webhook.id);
        } catch (e) {
            console.warn('Could not save lastUsedWebhookId', e);
        }
    }

    const note = await joplin.workspace.selectedNote();
    if (!note) {
        await joplin.views.dialogs.showMessageBox(_('errorNoNoteSelected'));
        return;
    }

    let bodyToProcess = note.body;
    let selectedText = '';
    try {
        selectedText = (await joplin.commands.execute('selectedText')) as string;
    } catch (e) {
        console.warn('Could not get selected text', e);
    }

    let isSelectedText = false;
    if (selectedText && selectedText.length > 0) {
        bodyToProcess = selectedText;
        isSelectedText = true;
    }

    const copyNoteBeforeSend = await joplin.settings.value('copyNoteBeforeSend');
    if (copyNoteBeforeSend) {
        try {
            await joplin.clipboard.writeText(note.body);
            const toastDuration = 3000;
            await joplin.views.dialogs.showToast({ message: _('noteBodyCopiedToClipboard'), type: ToastType.Success, timestamp: Date.now(), duration: toastDuration });
            // Joplin이 화면 복귀 시 마지막 toast를 재표시하는 현상 방지:
            // toast가 사라진 직후 빈 toast로 내부 상태를 덮어씀.
            setTimeout(async () => {
                try {
                    await joplin.views.dialogs.showToast({ message: '', duration: 1, timestamp: Date.now() });
                } catch (_e) { /* Ignore */ }
            }, toastDuration + 100);
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
        while ((match = resourceRegex.exec(bodyToProcess)) !== null) {
            resourceIds.add(match[1]);
        }

        // Use standard FormData — works on both desktop and mobile
        const formData = new FormData();
        let modifiedBody = bodyToProcess;

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

        if (!isSelectedText) {
            note.body = modifiedBody;
        }

        // Add note fields as text parts
        for (const [key, value] of Object.entries(note)) {
            if (key === 'body') {
                formData.append(key, modifiedBody);
            } else if (typeof value === 'object' || Array.isArray(value)) {
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

        // Joplin Environment Info
        const joplinInfo = await getJoplinInfo();
        formData.append('joplin_info', JSON.stringify(joplinInfo));

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
            const linkHandlerTranslations = JSON.stringify({
                linkCopied: _('linkCopied'),
                linkCopyFailed: _('linkCopyFailed'),
            }).replace(/"/g, '&quot;');
            await joplin.views.dialogs.setHtml(htmlDialogHandle, `
                <style>
                    html, body {
                        margin: 0;
                        padding: 0;
                        height: 100%;
                        box-sizing: border-box;
                        font-family: var(--joplin-font-family, sans-serif);
                        font-size: var(--joplin-note-viewer-font-size, 15px);
                        color: var(--joplin-color, #333);
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
                <input type="hidden" id="linkHandlerTranslations" value="${linkHandlerTranslations}">
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
                        if (isSelectedText) {
                            await joplin.commands.execute('replaceSelection', rawResponse);
                        } else {
                            await joplin.commands.execute('editor.execCommand', { name: 'selectAll' });
                            await joplin.commands.execute('replaceSelection', rawResponse);
                        }
                    } else {
                        // Mobile: editor commands not supported, write directly to DB
                        if (isSelectedText) {
                            await joplin.views.dialogs.showMessageBox(_('errorMobileReplaceUnsupported'));
                        } else {
                            await joplin.data.put(['notes', note.id], null, { body: rawResponse });
                        }
                    }
                } else {
                    await joplin.views.dialogs.showMessageBox(_('errorNoteMismatch'));
                }
            }

        } else if (webhook.responseHandling === 'file') {
            // --- File insertion mode ---
            const versionInfo = await joplin.versionInfo();
            if (versionInfo.platform !== 'desktop') {
                await joplin.views.dialogs.showMessageBox(_('errorMobileFileUnsupported'));
                return;
            }

            // 1. Header parsing
            const headerKeysInput = webhook.binaryHeaderKeys === undefined ? 'all' : webhook.binaryHeaderKeys.trim();

            const escapeHtml = (unsafe: string) => {
                return unsafe
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&#039;");
            };

            const safeDecode = (val: string) => {
                try {
                    return val.includes('%') ? decodeURIComponent(val) : val;
                } catch (e) {
                    return val;
                }
            };

            let extractedHeadersHtml = '';

            if (headerKeysInput === 'all_json') {
                const allHeaders: Record<string, string> = {};
                response.headers.forEach((value, key) => {
                    allHeaders[key] = safeDecode(value);
                });
                extractedHeadersHtml = `<pre style="margin:0;">${escapeHtml(JSON.stringify(allHeaders, null, 2))}</pre>`;
            } else if (headerKeysInput === 'all') {
                const allHeaders: string[] = [];
                response.headers.forEach((value, key) => {
                    allHeaders.push(`<b>${escapeHtml(key)}</b>: ${escapeHtml(safeDecode(value))}`);
                });
                extractedHeadersHtml = allHeaders.join('<br>');
            } else {
                const keys = headerKeysInput.split(',').map(k => k.trim()).filter(k => k);
                const foundHeaders: string[] = [];
                for (const key of keys) {
                    const val = response.headers.get(key.toLowerCase());
                    if (val !== null) {
                        foundHeaders.push(`<b>${escapeHtml(key)}</b>: ${escapeHtml(safeDecode(val))}`);
                    }
                }
                if (foundHeaders.length > 0) {
                    extractedHeadersHtml = foundHeaders.join('<br>');
                } else {
                    extractedHeadersHtml = `<div style="color: var(--joplin-color-faded, #666); font-style: italic;">(No matching headers found)</div>`;
                }
            }

            const helpText = _('binaryHeaderHelp').split('\n').map(line => escapeHtml(line)).join('<br>');
            const helpTitle = escapeHtml(_('binaryHeaderHelpTitle') || 'Help: Header Text Options');
            const headersTitle = escapeHtml(_('binaryHeadersTitle') || 'Headers');

            const headerHtml = `
                <details open style="margin-bottom: 15px; border-bottom: 1px solid var(--joplin-divider-color, #e0e0e0); padding-bottom: 10px;">
                    <summary style="cursor: pointer; font-weight: bold; margin-bottom: 10px;">${helpTitle}</summary>
                    <div style="color: var(--joplin-color-faded, #666); line-height: 1.5; font-size: 0.9em; margin-top: 5px;">${helpText}</div>
                </details>
                <div style="font-weight: bold; margin-bottom: 5px;">${headersTitle}</div>
                <div class="header-box" id="header-box" title="Click to copy">
                    ${extractedHeadersHtml || `<div style="color: var(--joplin-color-faded, #666); font-style: italic;">(No matching headers found)</div>`}
                </div>
            `;

            // 2. Read binary data
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // Determine filename and mimetype
            let filename = 'response_file';
            const contentDisposition = response.headers.get('content-disposition');
            if (contentDisposition) {
                const fnMatch = contentDisposition.match(/filename\*?=['"]*(?:UTF-8'')?([^;"'\n]+)/i);
                if (fnMatch && fnMatch[1]) {
                    filename = safeDecode(fnMatch[1].trim());
                }
            } else {
                const contentType = response.headers.get('content-type') || 'application/octet-stream';
                const mimeToExt: Record<string, string> = {
                    'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
                    'image/webp': 'webp', 'image/svg+xml': 'svg',
                    'application/pdf': 'pdf', 'text/plain': 'txt',
                    'text/html': 'html', 'application/json': 'json',
                };
                const mimeBase = contentType.split(';')[0].trim();
                const ext = mimeToExt[mimeBase];
                if (ext) filename = `response_file.${ext}`;
            }

            const contentType = response.headers.get('content-type') || 'application/octet-stream';
            const mimeType = contentType.split(';')[0].trim();
            const isImage = mimeType.startsWith('image/');

            // 3. Show Dialog
            await joplin.views.dialogs.setButtons(htmlDialogHandle, [
                { id: 'insertTop', title: _('binaryInsertTop') },
                { id: 'insertCursor', title: _('binaryInsertCursor') },
                { id: 'insertBottom', title: _('binaryInsertBottom') },
                { id: 'cancel', title: _('cancel') },
            ]);

            const linkHandlerTranslations = JSON.stringify({
                headerCopySuccess: _('headerCopySuccess'),
                headerCopyFailed: _('headerCopyFailed'),
            }).replace(/"/g, '&quot;');

            await joplin.views.dialogs.setHtml(htmlDialogHandle, `
                <style>
                    html, body { 
                        margin: 0; 
                        padding: 0; 
                        height: 100%; 
                        box-sizing: border-box; 
                        font-family: var(--joplin-font-family, sans-serif);
                        font-size: var(--joplin-note-viewer-font-size, 15px);
                        color: var(--joplin-color, #333);
                    }
                    #response-container { padding: 15px; min-width: 600px; box-sizing: border-box; line-height: 1.5; }
                    .header-box {
                        background: var(--joplin-background-color3, #f5f5f5);
                        border: 1px solid var(--joplin-divider-color, #e0e0e0);
                        border-radius: 4px;
                        padding: 10px;
                        margin-bottom: 15px;
                        cursor: pointer;
                        user-select: text;
                        word-break: break-word;
                    }
                    .header-box:hover {
                        background: var(--joplin-background-color-hover3, #eeeeee);
                    }
                    .status-msg { margin-top: 10px; font-weight: bold; }
                </style>
                <input type="hidden" id="linkHandlerTranslations" value="${linkHandlerTranslations}">
                <div id="response-container">
                    ${headerHtml}
                    <div style="font-weight: bold; margin-bottom: 5px; margin-top: 15px;">File Information</div>
                    <div>
                        <b>Filename:</b> ${escapeHtml(filename)}<br>
                        <b>Type:</b> ${escapeHtml(mimeType)}
                    </div>
                </div>
            `);

            const dlgResult = await joplin.views.dialogs.open(htmlDialogHandle);
            if (dlgResult.id === 'cancel' || !dlgResult.id) {
                return;
            }

            try {
                // 4. Create resource
                const os = require('os');
                const path = require('path');
                const fs = require('fs-extra');
                const tempFilePath = path.join(os.tmpdir(), `joplin2n8n_${Date.now()}_${filename}`);
                fs.writeFileSync(tempFilePath, buffer);

                let resource;
                try {
                    resource = await joplin.data.post(
                        ['resources'],
                        null,
                        { title: filename, mime: mimeType },
                        [{ path: tempFilePath }]
                    );
                } finally {
                    fs.removeSync(tempFilePath);
                }

                if (!resource || !resource.id) {
                    throw new Error('Resource creation failed');
                }

                const mdLink = isImage
                    ? `![${filename}](:/${resource.id})`
                    : `[${filename}](:/${resource.id})`;

                // 5. Insert into note
                if (dlgResult.id === 'insertCursor') {
                    await joplin.commands.execute('replaceSelection', '\n' + mdLink + '\n');
                } else {
                    const currentNote = await joplin.workspace.selectedNote();
                    if (currentNote && currentNote.id === note.id) {
                        if (dlgResult.id === 'insertTop') {
                            const newBody = mdLink + '\n\n' + (currentNote.body || '');
                            await joplin.data.put(['notes', note.id], null, { body: newBody });
                        } else if (dlgResult.id === 'insertBottom') {
                            const newBody = (currentNote.body || '').trimEnd() + '\n\n' + mdLink + '\n';
                            await joplin.data.put(['notes', note.id], null, { body: newBody });
                        }
                    }
                }
                // Success: Dialog closes, no extra message box.
            } catch (err: any) {
                await joplin.views.dialogs.showMessageBox(_('binaryFailed', err.message || String(err)));
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

            // Note toolbar button registration has been moved to use an integrated button
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
                let lastUsedWebhookId = '';
                try {
                    lastUsedWebhookId = await joplin.settings.value('lastUsedWebhookId');
                } catch (e) {
                    // Ignore
                }

                let optionsHtml = '';
                for (const hook of currentHooks) {
                    const isSelected = hook.id === lastUsedWebhookId ? ' selected' : '';
                    optionsHtml += `<option value="${hook.id}"${isSelected}>${hook.title || 'n8n'}</option>`;
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

    if (showInNoteToolbar) {
        try {
            await joplin.views.toolbarButtons.create(`${mobileSendCmdId}_ntb`, mobileSendCmdId, ToolbarButtonLocation.NoteToolbar);
        } catch (e) {
            console.warn(e);
        }
    }

    // Always add the settings command
    menuItems.push({ commandName: 'joplin2n8n.openManager' });

    // Editor Context Menu — Use the integrated send dialog for selected text
    const versionInfoForMenu = await joplin.versionInfo();
    if (showInContextMenu && versionInfoForMenu.platform === 'desktop') {
        try {
            await joplin.views.menuItems.create(`${mobileSendCmdId}_ctx_editor`, mobileSendCmdId, MenuItemLocation.EditorContextMenu);
        } catch (e) {
            console.warn('Could not add to EditorContextMenu:', e);
        }
    }

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
                        await joplin.views.dialogs.showMessageBox(_('restartRequiredToApplyUIChanges'));
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
        await joplin.views.dialogs.addScript(htmlDialogHandle, './webview/linkHandler.js');
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
                    await joplin.views.dialogs.showMessageBox(_('restartRequiredToApplyUIChanges'));
                }
            });
        });
        await registerBaseCommands();
        await updateDynamicMenu();
    },
});
