// Webview script for managing webhooks

let webhooks = [];
let t = {};

function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

function render() {
    const app = document.getElementById('app');
    if (!app) return;
    
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
                    <label>ID</label>
                    <input type="text" data-index="${index}" data-field="basicUser" value="${escapeHtml(hook.basicUser || '')}" placeholder="username">
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" data-index="${index}" data-field="basicPass" value="${escapeHtml(hook.basicPass || '')}" placeholder="password">
                </div>
            `;
        } else if (hook.authType === 'header') {
            authFields = `
                <div class="form-group">
                    <label>${t.headerPreview || 'Header Auth Value'}</label>
                    <input type="text" data-index="${index}" data-field="headerAuth" value="${escapeHtml(hook.headerAuth || '')}" placeholder="Bearer abcd...">
                </div>
            `;
        }

        item.innerHTML = `
            <div class="form-group">
                <label>${t.webhookTitle || 'Title'}</label>
                <input type="text" data-index="${index}" data-field="title" value="${escapeHtml(hook.title || '')}" placeholder="e.g. Production n8n">
            </div>
            <div class="form-group">
                <label>${t.webhookUrl || 'URL'}</label>
                <input type="text" data-index="${index}" data-field="url" value="${escapeHtml(hook.url || '')}" placeholder="https://n8n.example.com/webhook/...">
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
                </select>
            </div>
            <div style="text-align: right; margin-top: 10px;">
                <button type="button" class="btn btn-danger delete-btn" data-index="${index}">${t.delete || 'Delete'}</button>
            </div>
        `;
        list.appendChild(item);
    });

    // Attach event listeners
    const addBtn = document.getElementById('add-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            webhooks.push({
                id: generateId(),
                title: '',
                url: '',
                authType: 'none',
                responseHandling: 'status'
            });
            render();
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

    document.querySelectorAll('input, select').forEach(el => {
        el.addEventListener('change', (e) => {
            const index = e.target.getAttribute('data-index');
            const field = e.target.getAttribute('data-field');
            if (index !== null && field) {
                const idx = parseInt(index, 10);
                webhooks[idx][field] = e.target.value;
                if (field === 'authType') {
                    render();
                }
                updateHiddenInput();
            }
        });
        el.addEventListener('input', (e) => {
            const index = e.target.getAttribute('data-index');
            const field = e.target.getAttribute('data-field');
            if (index !== null && field && field !== 'authType' && field !== 'responseHandling') {
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
