// 잔존 숨김 스타일이 있다면 즉시 제거하여 OK, 취소 버튼 복원
try {
    var parentDoc = window.parent && window.parent.document;
    if (parentDoc) {
        var legacy = parentDoc.getElementById('joplin2n8n-diff-hide-btn-bar');
        if (legacy) legacy.remove();
    }
} catch (e) {}

document.addEventListener('DOMContentLoaded', function() {
    var sel = document.getElementById('webhookId');
    if (sel) {
        var selectedOpt = sel.querySelector('option[selected]') || sel.querySelector('option:checked');
        if (selectedOpt) {
            selectedOpt.scrollIntoView({ block: 'nearest' });
        }
        sel.focus();
    }
});
