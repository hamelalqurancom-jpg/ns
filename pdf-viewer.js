/**
 * pdf-viewer.js — PDF.js Rendering Engine
 * Renders PDF pages with canvas + text layer for programmatic text selection.
 * Feature A: Captures mouse text selection and triggers AI popup.
 */

const PDFViewer = (() => {
    let pdfDoc = null;
    let currentPage = 1;
    let totalPages = 0;
    let currentScale = 1.5;
    let pageTextContent = '';

    // DOM refs
    let container, pageInfo, zoomInfo;

    // Configure PDF.js worker
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    function init() {
        container = document.getElementById('pdf-page-container');
        pageInfo = document.getElementById('page-info');
        zoomInfo = document.getElementById('zoom-info');

        // Navigation buttons
        document.getElementById('prev-page').addEventListener('click', prevPage);
        document.getElementById('next-page').addEventListener('click', nextPage);
        document.getElementById('zoom-in').addEventListener('click', () => setZoom(currentScale + 0.25));
        document.getElementById('zoom-out').addEventListener('click', () => setZoom(currentScale - 0.25));
        document.getElementById('analyze-full-btn').addEventListener('click', () => Upload.analyzeFullPDF());

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') prevPage();
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') nextPage();
        });

        // Feature A: Text selection handler on the document
        document.addEventListener('mouseup', handleTextSelection);
    }

    /**
     * Load a PDF document from an ArrayBuffer.
     */
    async function loadDocument(data) {
        try {
            pdfDoc = await pdfjsLib.getDocument({
                data: data,
                cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
                cMapPacked: true
            }).promise;
            totalPages = pdfDoc.numPages;
            currentPage = 1;
            updatePageInfo();
            await renderPage(currentPage);
            Toast.show(`📄 تم تحميل المستند — ${totalPages} صفحة`, 'success');
        } catch (err) {
            console.error('PDF load error:', err);
            Toast.show('❌ خطأ في تحميل ملف PDF', 'error');
        }
    }

    /**
     * Render a specific page with canvas + text layer.
     */
    async function renderPage(pageNum) {
        if (!pdfDoc) return;

        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: currentScale });

        // Clear previous content
        container.innerHTML = '';

        // Create canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.display = 'block';
        container.appendChild(canvas);

        // Render PDF page to canvas
        await page.render({ canvasContext: ctx, viewport }).promise;

        // Create text layer for selection
        const textContent = await page.getTextContent();
        const textLayerDiv = document.createElement('div');
        textLayerDiv.className = 'textLayer';
        textLayerDiv.style.width = viewport.width + 'px';
        textLayerDiv.style.height = viewport.height + 'px';
        container.appendChild(textLayerDiv);

        // Render text layer using PDF.js
        pdfjsLib.renderTextLayer({
            textContent,
            container: textLayerDiv,
            viewport,
            textDivs: []
        });

        // Store page text for context
        pageTextContent = textContent.items.map(item => item.str).join(' ');

        container.style.width = viewport.width + 'px';
        container.style.height = viewport.height + 'px';
    }

    /**
     * Feature A: Handle mouse text selection on the PDF.
     * Captures selected text and opens the AI popup.
     */
    function handleTextSelection(e) {
        // Only handle selections within the PDF viewer
        const pdfViewer = document.getElementById('pdf-viewer');
        if (!pdfViewer || pdfViewer.style.display === 'none') return;

        // Don't trigger if clicking popup or sidebar
        const popup = document.getElementById('ai-popup');
        if (popup.contains(e.target)) return;

        const selection = window.getSelection();
        const text = selection.toString().trim();

        if (text.length >= 2) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            // Check if selection is within the PDF container
            const containerRect = container.getBoundingClientRect();
            if (
                rect.top >= containerRect.top - 50 &&
                rect.bottom <= containerRect.bottom + 50
            ) {
                Popup.show(text, rect);
            }
        }
    }

    function prevPage() {
        if (currentPage <= 1) return;
        currentPage--;
        updatePageInfo();
        renderPage(currentPage);
    }

    function nextPage() {
        if (currentPage >= totalPages) return;
        currentPage++;
        updatePageInfo();
        renderPage(currentPage);
    }

    function setZoom(scale) {
        scale = Math.max(0.5, Math.min(3, scale));
        currentScale = scale;
        zoomInfo.textContent = Math.round(scale * 100) + '%';
        renderPage(currentPage);
    }

    function updatePageInfo() {
        pageInfo.textContent = `${currentPage} / ${totalPages}`;
    }

    /**
     * Get text content of the current page (used as context for voice queries).
     */
    function getCurrentPageText() {
        return pageTextContent;
    }

    return { init, loadDocument, getCurrentPageText };
})();
