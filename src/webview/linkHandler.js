function showWebviewToast(message, isError) {
    let toast = document.getElementById('joplin2n8n-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'joplin2n8n-toast';
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%)';
        toast.style.padding = '10px 20px';
        toast.style.borderRadius = '5px';
        toast.style.color = 'white';
        toast.style.fontFamily = 'sans-serif';
        toast.style.fontSize = '14px';
        toast.style.zIndex = '9999';
        toast.style.transition = 'opacity 0.3s ease-in-out';
        toast.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
        document.body.appendChild(toast);
    }
    
    toast.style.backgroundColor = isError ? '#e74c3c' : '#2ecc71';
    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.display = 'block';

    if (window.toastTimeout) {
        clearTimeout(window.toastTimeout);
    }
    
    window.toastTimeout = setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            toast.style.display = 'none';
        }, 300);
    }, 3000);
}

function getTranslations() {
    const el = document.getElementById('linkHandlerTranslations');
    if (el && el.value) {
        try { return JSON.parse(el.value); } catch(e) {}
    }
    // fallback (영어)
    return {
        linkCopied: 'Link copied to clipboard. Please open it directly in your browser.',
        linkCopyFailed: 'Failed to copy link.',
    };
}

function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    
    // 화면에 안보이게 처리
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        const successful = document.execCommand('copy');
        const t = getTranslations();
        if (successful) {
            showWebviewToast(t.linkCopied, false);
        } else {
            showWebviewToast(t.linkCopyFailed, true);
        }
    } catch (err) {
        showWebviewToast(getTranslations().linkCopyFailed, true);
    }

    document.body.removeChild(textArea);
}

document.addEventListener('click', function(e) {
    const headerBox = e.target.closest('#header-box');
    if (headerBox) {
        let textToCopy = headerBox.innerText || headerBox.textContent;
        // fallbackCopyTextToClipboard will handle showing the toast, but we need to change what it shows.
        // Wait, fallbackCopyTextToClipboard uses getTranslations().linkCopied. 
        // We want headerCopySuccess instead.
        // I will write a small custom copy block here since it's cleaner.
        
        const textArea = document.createElement("textarea");
        textArea.value = textToCopy;
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            const successful = document.execCommand('copy');
            const t = getTranslations();
            if (successful) {
                showWebviewToast(t.headerCopySuccess || 'Copied successfully', false);
            } else {
                showWebviewToast(t.headerCopyFailed || 'Failed to copy', true);
            }
        } catch (err) {
            showWebviewToast(getTranslations().headerCopyFailed || 'Failed to copy', true);
        }
        document.body.removeChild(textArea);
        return;
    }

    const target = e.target.closest('a');
    if (target && target.href) {
        e.preventDefault();
        const url = target.href;
        
        if (!navigator.clipboard) {
            fallbackCopyTextToClipboard(url);
            return;
        }
        
        navigator.clipboard.writeText(url).then(function() {
            showWebviewToast(getTranslations().linkCopied, false);
        }).catch(function() {
            // 권한이나 포커스 문제로 실패할 경우 fallback 실행
            fallbackCopyTextToClipboard(url);
        });
    }
});

function applyButtonWrapStyle() {
    try {
        const parentDoc = window.parent && window.parent.document;
        if (!parentDoc || parentDoc === document) return;

        // <style> 태그를 parent document에 한 번만 주입
        if (!parentDoc.getElementById('joplin2n8n-btn-wrap-style')) {
            const style = parentDoc.createElement('style');
            style.id = 'joplin2n8n-btn-wrap-style';
            style.textContent = [
                '.user-dialog-button-bar {',
                '    display: flex !important;',
                '    flex-wrap: wrap !important;',
                '    justify-content: flex-end !important;',
                '    gap: 6px !important;',
                '    padding: 4px 8px !important;',
                '    box-sizing: border-box !important;',
                '}',
                '.user-dialog-button-bar button {',
                '    white-space: normal !important;',
                '    height: auto !important;',
                '    min-height: 32px !important;',
                '    line-height: 1.3 !important;',
                '    flex-shrink: 0 !important;',
                '    max-width: 100% !important;',
                '    word-break: break-word !important;',
                '}',
            ].join('\n');
            (parentDoc.head || parentDoc.documentElement).appendChild(style);
        }
    } catch (e) {
        // parent document 접근 불가 시 무시
    }
}

// 초기 적용
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyButtonWrapStyle);
} else {
    applyButtonWrapStyle();
}
setTimeout(applyButtonWrapStyle, 100);
setTimeout(applyButtonWrapStyle, 400);

// MutationObserver: parent document에 버튼 바가 추가될 때마다 재적용
(function watchButtonBar() {
    try {
        const parentDoc = window.parent && window.parent.document;
        if (!parentDoc || parentDoc === document) return;

        const observer = new MutationObserver(function() {
            applyButtonWrapStyle();
        });
        const root = parentDoc.body || parentDoc.documentElement;
        if (root) {
            observer.observe(root, { childList: true, subtree: true });
            // 5초 후 자동 해제 (다이얼로그 열린 후 변동 없으므로)
            setTimeout(function() { observer.disconnect(); }, 5000);
        }
    } catch (e) {
        // Ignore
    }
})();
