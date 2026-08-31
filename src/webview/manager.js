// Webview script for managing webhooks

let webhooks = [];
let t = {};

function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

function render(scrollTop) {
    const app = document.getElementById('app');
    if (!app) return;

    // Save scroll position before re-render
    const prevList = document.getElementById('webhook-list');
    const savedScroll = scrollTop !== undefined ? scrollTop : (prevList ? prevList.scrollTop : 0);

    // Save open/closed state of existing details elements
    const existingDetails = document.querySelectorAll('details.webhook-details');
    const openStates = existingDetails.length > 0 ? Array.from(existingDetails).map(d => d.open) : null;

    // Load data on first render if empty
    if (webhooks.length === 0) {
        const initialDataEl = document.getElementById('initialData');
        if (initialDataEl && initialDataEl.value) {
            try { webhooks = JSON.parse(initialDataEl.value); } catch (e) { console.error(e); }
        }
    }
    if (Object.keys(t).length === 0) {
        const transDataEl = document.getElementById('translationsData');
        if (transDataEl && transDataEl.value) {
            try { t = JSON.parse(transDataEl.value); } catch (e) { console.error(e); }
        }
    }

    app.innerHTML = `
        <div class="webhook-manager">
            <div class="header">
                <h2>${t.title || 'Webhook Manager'}</h2>
                <div class="header-actions">
                    <button type="button" class="btn" id="add-btn">${t.addWebhook || 'Add New n8n Webhook'}</button>
                    <button type="button" class="btn" id="export-btn">${t.exportWebhooks || 'Save to File'}</button>
                    <button type="button" class="btn" id="import-btn">${t.importWebhooks || 'Load from File'}</button>
                    <button type="button" class="btn" id="toggle-all-btn">${t.toggleAllCollapse || `${t.toggleAll || 'All'} ▼`}</button>
                    <input type="file" id="import-file-input" accept=".json,application/json" style="display: none;">
                </div>
            </div>
            <div id="webhook-list"></div>
        </div>

        <div id="export-modal" class="modal-overlay" style="display: none;">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${t.exportModalTitle || 'Webhook JSON Backup & Restore'}</h3>
                    <button type="button" class="btn" id="modal-close-x-btn" style="padding: 2px 8px; border: none; font-size: 16px;">✕</button>
                </div>
                <p class="modal-desc">${t.exportModalDesc || 'Copy JSON to backup, or edit/paste and click [Apply] to restore.'}</p>
                <textarea id="export-json-textarea" class="modal-textarea" placeholder="JSON..."></textarea>
                <div class="modal-actions">
                    <button type="button" class="btn" id="modal-copy-btn">${t.copyJson || '📋 Copy'}</button>
                    <button type="button" class="btn" id="modal-paste-btn">${t.pasteJson || '📋 Paste'}</button>
                    <button type="button" class="btn" id="modal-share-btn" style="display: none;">${t.shareViaSystem || '📤 Share via System'}</button>
                    <button type="button" class="btn" id="modal-apply-btn" style="font-weight: bold;">${t.applyJson || '📥 Apply'}</button>
                    <button type="button" class="btn" id="modal-close-btn">${t.close || 'Close'}</button>
                </div>
            </div>
        </div>
    `;

    const list = document.getElementById('webhook-list');
    webhooks.forEach((hook, index) => {
        const item = document.createElement('div');
        item.className = 'webhook-item';
        const isOpen = openStates ? (openStates[index] !== undefined ? openStates[index] : true) : true;

        let authFields = '';
        if (hook.authType === 'basic') {
            authFields = `
                <div class="form-group">
                    <label>Username</label>
                    <input type="text" data-index="${index}" data-field="basicUser" value="${escapeHtml(hook.basicUser || '')}">
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" data-index="${index}" data-field="basicPass" value="${escapeHtml(hook.basicPass || '')}">
                </div>
            `;
        } else if (hook.authType === 'header') {
            authFields = `
                <div class="form-group">
                    <label>${t.headerPreview || 'Header Auth'}</label>
                    <input type="text" data-index="${index}" data-field="headerAuth" value="${escapeHtml(hook.headerAuth || '')}">
                </div>
            `;
        }

        item.innerHTML = `
            <div class="webhook-header-actions">
                ${index > 0 ? `<button type="button" class="btn move-up-btn" data-index="${index}">↑ ${t.moveUp || 'Move Up'}</button>` : ''}
                ${index < webhooks.length - 1 ? `<button type="button" class="btn move-down-btn" data-index="${index}">↓ ${t.moveDown || 'Move Down'}</button>` : ''}
                <button type="button" class="btn btn-danger delete-btn" data-index="${index}">${t.delete || 'Delete'}</button>
            </div>
            <details class="webhook-details" ${isOpen ? 'open' : ''} data-index="${index}">
                <summary class="webhook-summary">
                    <span id="webhook-title-display-${index}" class="webhook-title">${index + 1}${hook.title ? `: ${escapeHtml(hook.title)}` : ''}</span>
                </summary>
                <div class="webhook-body">
                    <div class="form-group">
                        <label>${t.webhookTitle || 'Webhook Title'}</label>
                        <input type="text" data-index="${index}" data-field="title" value="${escapeHtml(hook.title || '')}" placeholder="Optional">
                    </div>
                    <div class="form-group">
                        <label>${t.webhookUrl || 'Webhook URL'}</label>
                        <input type="text" data-index="${index}" data-field="url" value="${escapeHtml(hook.url || '')}" placeholder="http://...">
                    </div>
                    <div class="form-group">
                        <label>${t.authType || 'Auth Type'}</label>
                        <select data-index="${index}" data-field="authType">
                            <option value="none" ${hook.authType === 'none' ? 'selected' : ''}>${t.authNone || 'None'}</option>
                            <option value="basic" ${hook.authType === 'basic' ? 'selected' : ''}>${t.authBasic || 'Basic Auth'}</option>
                            <option value="header" ${hook.authType === 'header' ? 'selected' : ''}>${t.authHeader || 'Header Auth'}</option>
                        </select>
                    </div>
                    ${authFields}
                    <div class="form-group">
                        <label>${t.responseHandling || 'Response Handling'}</label>
                        <select data-index="${index}" data-field="responseHandling">
                            <option value="status" ${hook.responseHandling === 'status' ? 'selected' : ''}>${t.responseStatus || 'Status only'}</option>
                            <option value="text" ${hook.responseHandling === 'text' ? 'selected' : ''}>${t.responseText || 'Show Response TEXT'}</option>
                            <option value="html" ${hook.responseHandling === 'html' ? 'selected' : ''}>${t.responseHtml || 'Show Response HTML'}</option>
                            <option value="file" ${hook.responseHandling === 'file' ? 'selected' : ''}>${t.responseFile || 'Insert File into Note'}</option>
                        </select>
                    </div>
                    ${hook.responseHandling === 'file' ? `
                    <div class="form-group" style="margin-left: 20px; margin-top: -10px;">
                        <label>${t.binaryHeaderKeysLabel || 'Display the following header contents'}</label>
                        <input type="text" data-index="${index}" data-field="binaryHeaderKeys" value="${escapeHtml(hook.binaryHeaderKeys || '')}" placeholder="${t.binaryHeaderKeysPlaceholder || 'e.g., j2n-bin_desc, j2n-bin_by...'}">
                    </div>
                    ` : ''}
                    <div class="form-group">
                        <label>${t.attachmentHandling || 'Markdown Attachment Links'}</label>
                        <select data-index="${index}" data-field="attachmentHandling">
                            <option value="keep_id" ${hook.attachmentHandling === 'keep_id' || !hook.attachmentHandling ? 'selected' : ''}>${t.attachmentKeepId || 'Keep Link (:/joplin_resource_id)'}</option>
                            <option value="replace_name" ${hook.attachmentHandling === 'replace_name' ? 'selected' : ''}>${t.attachmentReplaceName || 'Replace with Filename'}</option>
                        </select>
                    </div>
                </div>
            </details>
        `;
        list.appendChild(item);
    });

    // Update toggle all button state
    function updateToggleAllBtn() {
        const toggleBtn = document.getElementById('toggle-all-btn');
        if (!toggleBtn) return;
        const allDetails = document.querySelectorAll('details.webhook-details');
        if (allDetails.length === 0) {
            toggleBtn.style.display = 'none';
            return;
        } else {
            toggleBtn.style.display = '';
        }
        const hasOpen = Array.from(allDetails).some(d => d.open);
        if (hasOpen) {
            toggleBtn.textContent = t.toggleAllCollapse || `${t.toggleAll || 'All'} ▼`;
        } else {
            toggleBtn.textContent = t.toggleAllExpand || `${t.toggleAll || 'All'} ▶`;
        }
    }

    updateToggleAllBtn();

    // Restore scroll position
    const newList = document.getElementById('webhook-list');
    if (newList) newList.scrollTop = savedScroll;

    // Attach event listeners
    const addBtn = document.getElementById('add-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            webhooks.push({
                id: generateId(),
                title: '',
                url: '',
                authType: 'none',
                responseHandling: 'status',
                attachmentHandling: 'keep_id'
            });
            render();
            // Scroll to bottom so the new webhook is visible
            const list = document.getElementById('webhook-list');
            if (list) list.scrollTop = list.scrollHeight;
            updateHiddenInput();
        });
    }

    const exportBtn = document.getElementById('export-btn');
    const exportModal = document.getElementById('export-modal');
    const exportTextarea = document.getElementById('export-json-textarea');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalCloseXBtn = document.getElementById('modal-close-x-btn');
    const modalCopyBtn = document.getElementById('modal-copy-btn');
    const modalPasteBtn = document.getElementById('modal-paste-btn');
    const modalShareBtn = document.getElementById('modal-share-btn');
    const modalApplyBtn = document.getElementById('modal-apply-btn');

    if (exportBtn && exportModal && exportTextarea) {
        exportBtn.addEventListener('click', () => {
            const dataStr = (webhooks && webhooks.length > 0) ? JSON.stringify(webhooks, null, 2) : '';

            // 1. Try file download (Works on PC)
            if (dataStr) {
                try {
                    const blob = new Blob([dataStr], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    const now = new Date();
                    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
                    a.href = url;
                    a.download = `joplin2n8n_webhooks_${dateStr}.json`;
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => {
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    }, 100);
                } catch (err) {
                    console.warn('Direct file download error', err);
                }
            }

            // 2. Open Modal for Direct Editing / Clipboard / Paste / Apply / Share
            exportTextarea.value = dataStr;
            exportModal.style.display = 'flex';

            if (modalShareBtn) {
                if (navigator.share) {
                    modalShareBtn.style.display = 'inline-block';
                } else {
                    modalShareBtn.style.display = 'none';
                }
            }
        });

        const closeModal = () => {
            exportModal.style.display = 'none';
            if (modalCopyBtn) {
                modalCopyBtn.textContent = t.copyJson || '📋 Copy';
            }
            if (modalPasteBtn) {
                modalPasteBtn.textContent = t.pasteJson || '📋 Paste';
            }
        };

        if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
        if (modalCloseXBtn) modalCloseXBtn.addEventListener('click', closeModal);
        exportModal.addEventListener('click', (e) => {
            if (e.target === exportModal) closeModal();
        });

        if (modalCopyBtn) {
            modalCopyBtn.addEventListener('click', () => {
                const text = exportTextarea.value;
                if (!text) return;
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text).then(() => {
                        modalCopyBtn.textContent = '✅ ' + (t.copied || 'Copied!');
                        setTimeout(() => {
                            modalCopyBtn.textContent = t.copyJson || '📋 Copy';
                        }, 2500);
                    }).catch(() => {
                        fallbackCopy();
                    });
                } else {
                    fallbackCopy();
                }

                function fallbackCopy() {
                    exportTextarea.focus();
                    exportTextarea.select();
                    try {
                        document.execCommand('copy');
                        modalCopyBtn.textContent = '✅ ' + (t.copied || 'Copied!');
                        setTimeout(() => {
                            modalCopyBtn.textContent = t.copyJson || '📋 Copy';
                        }, 2500);
                    } catch (e) {
                        alert(t.linkCopyFailed || 'Failed to copy');
                    }
                }
            });
        }

        if (modalPasteBtn) {
            modalPasteBtn.addEventListener('click', () => {
                if (navigator.clipboard && navigator.clipboard.readText) {
                    navigator.clipboard.readText().then(clipText => {
                        if (clipText) {
                            exportTextarea.value = clipText;
                            modalPasteBtn.textContent = '✅ ' + (t.copied || 'Pasted!');
                            setTimeout(() => {
                                modalPasteBtn.textContent = t.pasteJson || '📋 Paste';
                            }, 2000);
                        }
                    }).catch(() => {
                        exportTextarea.focus();
                        exportTextarea.select();
                    });
                } else {
                    exportTextarea.focus();
                    exportTextarea.select();
                }
            });
        }

        if (modalApplyBtn) {
            modalApplyBtn.addEventListener('click', () => {
                const raw = exportTextarea.value.trim();
                if (!raw) {
                    alert(t.importErrorEmpty || 'JSON text is empty.');
                    return;
                }
                try {
                    const parsed = JSON.parse(raw);
                    let importedList = [];
                    if (Array.isArray(parsed)) {
                        importedList = parsed;
                    } else if (parsed && Array.isArray(parsed.webhooks)) {
                        importedList = parsed.webhooks;
                    } else if (parsed && typeof parsed === 'object' && parsed.url) {
                        importedList = [parsed];
                    } else {
                        alert(t.importErrorInvalidJson || 'Invalid JSON format');
                        return;
                    }

                    if (importedList.length === 0) {
                        alert(t.importErrorEmpty || 'No webhook settings found in JSON');
                        return;
                    }

                    const sanitized = importedList.map(item => ({
                        id: item.id || generateId(),
                        title: item.title || '',
                        url: item.url || '',
                        authType: item.authType || 'none',
                        basicUser: item.basicUser || '',
                        basicPass: item.basicPass || '',
                        headerAuth: item.headerAuth || '',
                        responseHandling: item.responseHandling || 'status',
                        binaryHeaderKeys: item.binaryHeaderKeys || '',
                        attachmentHandling: item.attachmentHandling || 'keep_id'
                    }));

                    if (webhooks.length > 0) {
                        if (confirm(t.importConfirm || 'Overwrite existing webhook settings?\n[OK]: Overwrite\n[Cancel]: Append')) {
                            webhooks = sanitized;
                        } else {
                            webhooks = webhooks.concat(sanitized);
                        }
                    } else {
                        webhooks = sanitized;
                    }

                    render();
                    updateHiddenInput();
                    closeModal();
                    alert(t.jsonAppliedSuccess || 'Webhook settings applied successfully.');
                } catch (err) {
                    console.error('Failed to apply JSON', err);
                    alert((t.importErrorInvalidJson || 'Invalid JSON') + '\n' + (err.message || ''));
                }
            });
        }

        if (modalShareBtn) {
            modalShareBtn.addEventListener('click', () => {
                const text = exportTextarea.value;
                if (navigator.share) {
                    navigator.share({
                        title: 'joplin2n8n_webhooks.json',
                        text: text
                    }).catch((err) => {
                        if (err.name !== 'AbortError') {
                            console.log('Share dismissed or failed', err);
                        }
                    });
                }
            });
        }
    }

    const importBtn = document.getElementById('import-btn');
    const importFileInput = document.getElementById('import-file-input');
    if (importBtn && importFileInput) {
        importBtn.addEventListener('click', () => {
            importFileInput.value = '';
            importFileInput.click();
        });

        importFileInput.addEventListener('change', (e) => {
            const files = e.target.files;
            if (!files || files.length === 0) return;
            const file = files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const parsed = JSON.parse(event.target.result);
                    let importedList = [];
                    if (Array.isArray(parsed)) {
                        importedList = parsed;
                    } else if (parsed && Array.isArray(parsed.webhooks)) {
                        importedList = parsed.webhooks;
                    } else if (parsed && typeof parsed === 'object' && parsed.url) {
                        importedList = [parsed];
                    } else {
                        alert(t.importErrorInvalidJson || 'Invalid JSON format');
                        return;
                    }

                    if (importedList.length === 0) {
                        alert(t.importErrorEmpty || 'No webhook settings found in file');
                        return;
                    }

                    const sanitized = importedList.map(item => ({
                        id: item.id || generateId(),
                        title: item.title || '',
                        url: item.url || '',
                        authType: item.authType || 'none',
                        basicUser: item.basicUser || '',
                        basicPass: item.basicPass || '',
                        headerAuth: item.headerAuth || '',
                        responseHandling: item.responseHandling || 'status',
                        binaryHeaderKeys: item.binaryHeaderKeys || '',
                        attachmentHandling: item.attachmentHandling || 'keep_id'
                    }));

                    if (webhooks.length > 0) {
                        if (confirm(t.importConfirm || 'Overwrite existing webhook settings?\n[OK]: Overwrite\n[Cancel]: Append')) {
                            webhooks = sanitized;
                        } else {
                            webhooks = webhooks.concat(sanitized);
                        }
                    } else {
                        webhooks = sanitized;
                    }

                    render();
                    updateHiddenInput();
                    alert(t.importSuccess || 'Webhooks loaded successfully.');
                } catch (err) {
                    console.error('Failed to parse imported JSON', err);
                    alert(t.importErrorInvalidJson || 'Invalid JSON file.');
                } finally {
                    importFileInput.value = '';
                }
            };
            reader.readAsText(file);
        });
    }

    const toggleAllBtn = document.getElementById('toggle-all-btn');
    if (toggleAllBtn) {
        toggleAllBtn.addEventListener('click', () => {
            const allDetails = document.querySelectorAll('details.webhook-details');
            const hasOpen = Array.from(allDetails).some(d => d.open);
            const targetState = !hasOpen;
            allDetails.forEach(d => {
                d.open = targetState;
            });
            updateToggleAllBtn();
        });
    }

    document.querySelectorAll('details.webhook-details').forEach(d => {
        d.addEventListener('toggle', () => {
            updateToggleAllBtn();
        });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = e.target.getAttribute('data-index');
            if (index !== null) {
                webhooks.splice(parseInt(index, 10), 1);
                render();
                updateHiddenInput();
            }
        });
    });

    document.querySelectorAll('.move-up-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(e.target.getAttribute('data-index'), 10);
            if (index > 0) {
                const temp = webhooks[index];
                webhooks[index] = webhooks[index - 1];
                webhooks[index - 1] = temp;
                render();
                updateHiddenInput();
            }
        });
    });

    document.querySelectorAll('.move-down-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(e.target.getAttribute('data-index'), 10);
            if (index < webhooks.length - 1) {
                const temp = webhooks[index];
                webhooks[index] = webhooks[index + 1];
                webhooks[index + 1] = temp;
                render();
                updateHiddenInput();
            }
        });
    });

    document.querySelectorAll('input, select').forEach(el => {
        el.addEventListener('change', (e) => {
            const index = e.target.getAttribute('data-index');
            const field = e.target.getAttribute('data-field');
            if (index !== null && field) {
                const idx = parseInt(index, 10);
                webhooks[idx][field] = e.target.value;
                if (field === 'authType' || field === 'responseHandling') {
                    render();
                }
                updateHiddenInput();
            }
        });
        el.addEventListener('input', (e) => {
            const index = e.target.getAttribute('data-index');
            const field = e.target.getAttribute('data-field');
            if (index !== null && field && field !== 'authType' && field !== 'responseHandling' && field !== 'attachmentHandling') {
                const idx = parseInt(index, 10);
                webhooks[idx][field] = e.target.value;
                if (field === 'title') {
                    const titleDisplay = document.getElementById(`webhook-title-display-${idx}`);
                    if (titleDisplay) {
                        const val = e.target.value;
                        titleDisplay.textContent = `Webhook ${idx + 1}${val ? ` (${val})` : ''}`;
                    }
                }
                updateHiddenInput();
            }
        });
    });
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function updateHiddenInput() {
    const input = document.getElementById('webhooksJson');
    if (input) {
        input.value = JSON.stringify(webhooks);
    }
}

// Initial render
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        render();
        updateHiddenInput();
    });
} else {
    render();
    updateHiddenInput();
}
