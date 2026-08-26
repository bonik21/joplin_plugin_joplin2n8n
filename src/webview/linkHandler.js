function showToast(message, isError) {
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
            showToast(t.linkCopied, false);
        } else {
            showToast(t.linkCopyFailed, true);
        }
    } catch (err) {
        showToast(getTranslations().linkCopyFailed, true);
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
                showToast(t.headerCopySuccess || 'Copied successfully', false);
            } else {
                showToast(t.headerCopyFailed || 'Failed to copy', true);
            }
        } catch (err) {
            showToast(getTranslations().headerCopyFailed || 'Failed to copy', true);
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
            showToast(getTranslations().linkCopied, false);
        }).catch(function() {
            // 권한이나 포커스 문제로 실패할 경우 fallback 실행
            fallbackCopyTextToClipboard(url);
        });
    }
});
