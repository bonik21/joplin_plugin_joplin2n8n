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
    
    // Load data on first render if empty
    if (webhooks.length === 0) {
        const initialDataEl = document.getElementById('initialData');
        if (initialDataEl && initialDataEl.value) {
            try { webhooks = JSON.parse(initialDataEl.value); } catch(e) { console.error(e); }
        }
    }
    if (Object.keys(t).length === 0) {
        const transDataEl = document.getElementById('translationsData');
        if (transDataEl && transDataEl.value) {
            try { t = JSON.parse(transDataEl.value); } catch(e) { console.error(e); }
        }
    }

    app.innerHTML = `
        <div class="webhook-manager">
            <div class="header">
                <h2>${t.title || 'Webhook Manager'}</h2>
                <button type="button" class="btn" id="add-btn">+ ${t.addWebhook || 'Add New n8n Webhook'}</button>
            </div>
            <div id="webhook-list"></div>
        </div>
    `;

    const list = document.getElementById('webhook-list');
    webhooks.forEach((hook, index) => {
        const item = document.createElement('div');
        item.className = 'webhook-item';
        
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
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h4 style="margin: 0;">Webhook ${index + 1}</h4>
                <div style="display: flex; gap: 5px;">
                    ${index > 0 ? `<button type="button" class="btn move-up-btn" data-index="${index}">↑ ${t.moveUp || 'Move Up'}</button>` : ''}
                    ${index < webhooks.length - 1 ? `<button type="button" class="btn move-down-btn" data-index="${index}">↓ ${t.moveDown || 'Move Down'}</button>` : ''}
                    <button type="button" class="btn btn-danger delete-btn" data-index="${index}">${t.delete || 'Delete'}</button>
                </div>
            </div>
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
        `;
        list.appendChild(item);
    });

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

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
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
