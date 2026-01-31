// Fason Client JS

// Send command to device (with auto-reload)
function sendCmd(cmd, params = {}, autoReload = true) {
    const id = typeof DEVICE_ID !== 'undefined' ? DEVICE_ID : '';
    if (!id) return;
    
    fetch(`/cmd/${id}/${cmd}?${new URLSearchParams(params)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(r => r.json())
    .then(data => {
        if (data.error) {
            toast(data.error, 'error');
        } else {
            toast(data.message || 'Sent', 'success');
            if (autoReload) setTimeout(() => location.reload(), 1500);
        }
    })
    .catch(err => toast('Request failed', 'error'));
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
    }, 3000);
}

// Auto-refresh page every 30s for live data
if (typeof DEVICE_ID !== 'undefined') {
    setInterval(() => {
        // Only auto-refresh if not on a form-heavy page
        const noRefresh = ['mic', 'sms'];
        const path = window.location.pathname;
        const shouldRefresh = !noRefresh.some(p => path.includes(p));
        
        if (shouldRefresh && document.visibilityState === 'visible') {
            // Soft refresh - fetch data without full reload
            // For now, just refresh every 30s
        }
    }, 30000);
}

// Keyboard shortcuts
document.addEventListener('keydown', e => {
    // ESC to go back to dashboard
    if (e.key === 'Escape' && window.location.pathname !== '/') {
        window.location.href = '/';
    }
});

console.log('✓ Fason Ready');
