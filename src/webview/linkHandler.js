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
        if (successful) {
            showToast('링크가 클립보드에 복사되었습니다. 브라우저에서 직접 열어주세요.', false);
        } else {
            showToast('링크 복사에 실패했습니다.', true);
        }
    } catch (err) {
        showToast('링크 복사에 실패했습니다.', true);
    }

    document.body.removeChild(textArea);
}

document.addEventListener('click', function(e) {
    const target = e.target.closest('a');
    if (target && target.href) {
        e.preventDefault();
        const url = target.href;
        
        if (!navigator.clipboard) {
            fallbackCopyTextToClipboard(url);
            return;
        }
        
        navigator.clipboard.writeText(url).then(function() {
            showToast('링크가 클립보드에 복사되었습니다. 브라우저에서 직접 열어주세요.', false);
        }).catch(function() {
            // 권한이나 포커스 문제로 실패할 경우 fallback 실행
            fallbackCopyTextToClipboard(url);
        });
    }
});
