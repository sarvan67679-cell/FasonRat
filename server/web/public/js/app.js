// Fason - Client-side logic

// Send command to device
function sendCmd(cmd, params = {}, autoReload = true) {
    const id = typeof DEVICE_ID !== 'undefined' ? DEVICE_ID : '';
    if (!id) return;
    
    fetch(`/cmd/${id}/${cmd}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
    })
    .then(r => r.json())
    .then(data => {
        if (data.error) {
            toast(data.error, 'error');
        } else {
            toast(data.message || 'Command sent', 'success');
            if (autoReload) setTimeout(() => location.reload(), 1200);
        }
    })
    .catch(() => toast('Request failed', 'error'));
}

// Send command without auto-reload
function sendCmdNoReload(cmd, params = {}) {
    sendCmd(cmd, params, false);
}

// Toast notification
function toast(msg, type = 'info') {
    const t = document.getElementById('toast');
    if (!t) return;
    
    t.textContent = msg;
    t.className = 'toast show ' + type;
    
    setTimeout(() => {
        t.className = 'toast';
    }, 2500);
}

// Auto-refresh for device pages
(function() {
    if (typeof DEVICE_ID === 'undefined') return;
    
    const noAutoRefresh = ['mic', 'sms', 'files'];
    const path = window.location.pathname;
    const shouldRefresh = !noAutoRefresh.some(p => path.includes(p));
    
    if (shouldRefresh) {
        setInterval(() => {
            if (document.visibilityState === 'visible') {
                location.reload();
            }
        }, 60000); // Refresh every 60s
    }
})();

// Keyboard shortcuts
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && window.location.pathname !== '/') {
        window.location.href = '/';
    }
});

console.log('Fason ready');
