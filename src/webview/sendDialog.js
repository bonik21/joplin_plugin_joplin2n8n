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
