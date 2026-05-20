/**
 * sidebar.js — Analysis Sidebar Panel
 * Manages the sidebar for displaying AI analysis results (PDF summaries, voice answers).
 */

const Sidebar = (() => {
    let sidebarEl, contentEl, closeBtn, toggleBtn;

    function init() {
        sidebarEl = document.getElementById('sidebar');
        contentEl = document.getElementById('sidebar-content');
        closeBtn = document.getElementById('sidebar-close');
        toggleBtn = document.getElementById('sidebar-toggle-btn');

        closeBtn.addEventListener('click', close);
        toggleBtn.addEventListener('click', toggle);
    }

    function open() {
        sidebarEl.classList.add('open');
    }

    function close() {
        sidebarEl.classList.remove('open');
    }

    function toggle() {
        sidebarEl.classList.toggle('open');
    }

    function setLoading(title = 'جارٍ التحليل...') {
        contentEl.innerHTML = `
            <div style="text-align:center;padding:40px 0;">
                <div class="dot-loader" style="display:inline-flex;margin-bottom:16px;">
                    <span></span><span></span><span></span>
                </div>
                <p style="color:var(--text-muted)">${title}</p>
            </div>`;
    }

    function clearContent() {
        contentEl.innerHTML = '';
    }

    function setContent(html) {
        contentEl.innerHTML = html;
    }

    function appendRaw(html) {
        contentEl.insertAdjacentHTML('beforeend', html);
    }

    function setMarkdown(md, prefix = '') {
        contentEl.innerHTML = prefix + marked.parse(md);
        contentEl.scrollTop = contentEl.scrollHeight;
    }

    return { init, open, close, toggle, setLoading, clearContent, setContent, appendRaw, setMarkdown };
})();
