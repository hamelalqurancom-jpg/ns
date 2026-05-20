/**
 * app.js — Main Application Entry Point
 * Initializes all modules and provides global utilities (Toast notifications).
 */

// ── Toast Notification System ───────────────────────────────────────────────
const Toast = (() => {
    const container = document.getElementById('toast-container');

    function show(message, type = 'info', duration = 3500) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
        toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(16px)';
            toast.style.transition = '0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    return { show };
})();

// ── Initialize All Modules on DOM Ready ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Ensure voices are loaded for TTS
    if (window.speechSynthesis) {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }

    // Init modules
    Sidebar.init();
    Popup.init();
    PDFViewer.init();
    Upload.init();
    Voice.init();

    // Configure marked.js for RTL-friendly rendering
    if (typeof marked !== 'undefined') {
        marked.setOptions({
            breaks: true,
            gfm: true
        });
    }

    console.log('%c AcademiQ AI %c Initialized ✓',
        'background:#6366f1;color:#fff;padding:4px 8px;border-radius:4px 0 0 4px;font-weight:bold',
        'background:#111827;color:#10b981;padding:4px 8px;border-radius:0 4px 4px 0');
});
