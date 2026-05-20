/**
 * upload.js — File Upload & Drag-and-Drop Handler
 * Feature D: Handles PDF and image uploads for viewing and AI analysis.
 */

const Upload = (() => {
    const GEMINI_API_KEY = 'AIzaSyDxqlnHr9ByyV1gKTqChTIqVQcCtOxRxxg';
    let uploadZone, zoneInner, fileInput, browseBtn;

    function init() {
        uploadZone = document.getElementById('upload-zone');
        zoneInner = document.getElementById('upload-zone-inner');
        fileInput = document.getElementById('file-input');
        browseBtn = document.getElementById('browse-btn');

        browseBtn.addEventListener('click', () => fileInput.click());
        zoneInner.addEventListener('click', (e) => {
            if (e.target !== browseBtn) fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) handleFile(e.target.files[0]);
        });

        // Drag-and-drop events
        ['dragenter', 'dragover'].forEach(evt => {
            zoneInner.addEventListener(evt, (e) => {
                e.preventDefault();
                zoneInner.classList.add('dragover');
            });
        });
        ['dragleave', 'drop'].forEach(evt => {
            zoneInner.addEventListener(evt, (e) => {
                e.preventDefault();
                zoneInner.classList.remove('dragover');
            });
        });
        zoneInner.addEventListener('drop', (e) => {
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
        });

        // "New file" button in the PDF toolbar
        document.getElementById('new-file-btn')?.addEventListener('click', resetToUpload);

        // "Analyze image" button
        document.getElementById('analyze-image-btn')?.addEventListener('click', analyzeCurrentImage);

        // "Close image" button
        document.getElementById('close-image-btn')?.addEventListener('click', resetToUpload);
    }

    /**
     * Handle an uploaded file — route to PDF viewer or image viewer.
     */
    function handleFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();

        if (ext === 'pdf') {
            handlePDF(file);
        } else if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
            handleImage(file);
        } else {
            Toast.show('صيغة ملف غير مدعومة. يرجى رفع PDF أو صورة.', 'error');
        }
    }

    /**
     * Handle PDF: load into viewer + upload to server for analysis.
     */
    async function handlePDF(file) {
        Toast.show(`جارٍ تحميل ${file.name}...`, 'info');

        // Read file locally for PDF.js rendering
        const arrayBuffer = await file.arrayBuffer();
        PDFViewer.loadDocument(arrayBuffer);

        // Show PDF viewer, hide upload zone
        uploadZone.style.display = 'none';
        document.getElementById('pdf-viewer').style.display = 'flex';
        document.getElementById('image-viewer').style.display = 'none';

        // Store file for later analysis
        handlePDF._currentFile = file;
        Toast.show('✅ تم فتح المستند وهو جاهز للتحليل', 'success');
    }

    /**
     * Handle Image: show in image viewer, ready for analysis.
     */
    function handleImage(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('image-preview').src = e.target.result;
            uploadZone.style.display = 'none';
            document.getElementById('pdf-viewer').style.display = 'none';
            document.getElementById('image-viewer').style.display = 'flex';
            Toast.show('✅ تم تحميل الصورة. اضغط "تحليل الصورة" للتحليل بالذكاء الاصطناعي.', 'success');
        };
        reader.readAsDataURL(file);

        // Store file for upload on analysis
        handleImage._currentFile = file;
    }

    /**
     * Convert File to Base64 string (without data url prefix)
     */
    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = error => reject(error);
        });
    }

    /**
     * Analyze the currently displayed image via Gemini Vision directly.
     */
    async function analyzeCurrentImage() {
        const file = handleImage._currentFile;
        if (!file) {
            Toast.show('لا توجد صورة للتحليل', 'error');
            return;
        }

        Sidebar.open();
        Sidebar.setLoading('🖼️ جارٍ تحليل الصورة...');

        try {
            const base64Data = await fileToBase64(file);
            const prompt = `You are the core AI engine of AcademiQ AI, an innovative educational platform. Your role is to act as an expert, highly engaging Egyptian private tutor (مدرس خصوصي شاطر، محبوك ومسهل للمناهج). You will receive either a snippet of text or an image from a document that a student has interacted with via text selection or long-press on their mobile screen.

Your responses will be rendered inside a small, dynamic, floating UI Tooltip Popover (Speech Bubble with a directional arrow) directly over the student's selected line. Therefore, you must strictly follow these structural and operational rules:

1. PERSONA & TONE OF VOICE:
   - Speak like a witty, supportive older brother or a popular, charismatic Egyptian private tutor.
   - Use friendly, highly simplified Egyptian Arabic (اللهجة المصرية العامية المبسطة) that clicks instantly with high school and university students.
   - Avoid rigid, academic, formal Arabic (الفصحى الجافة) completely, unless you are quoting an absolute scientific law, mathematical theorem, or official definition.

2. INPUT TYPE HANDLING (TEXT VS. IMAGE OCR):
   - TEXT INPUT: Directly analyze the context of the selected phrase/sentence and break down the core confusion.
   - IMAGE INPUT (Scanned PDFs/Mلازم): Perform instant visual and contextual OCR. Identify the text or formulas the student is focusing on, read the handwritten or typed characters within that visual crop, and explain it directly.

3. MOBILE UI & CONCISION CONSTRAINTS:
   - Screen space is extremely tight inside the floating popover wrapper. Your response MUST be ultra-concise, punchy, and scannable at a glance.
   - Keep the entire explanation within 3 to 4 lines maximum. Absolutely no long intros or rambling fluff.
   - Use Markdown efficiently: Bold (**text**) core technical terms or key parameters. Use short, crisp bullet points if breaking down steps or a reaction.

4. PEDAGOGICAL APPROACH & ANALOGIES:
   - Directly target the concept causing the bottleneck.
   - Whenever possible, anchor complex physics, chemistry, math, or coding concepts using an everyday analogy rooted in Egyptian culture or daily life.
   - Explain *why* the concept behaves this way, not just its passive definition.

5. OUTPUT TEMPLATE:
   - Line 1-3: Concise contextual breakdown + cultural analogy (Formatted in Markdown).
   - Line 4: End with a sharp, encouraging Egyptian tutor catchphrase to close the tooltip (e.g., "وصلت يا دكتور؟", "سهلة ولوز العنب أهي!", "ركز في الحتة دي عشان بتيجي في الامتحانات!", "فهمت اللعبة ماشية إزاي يا بطل؟").

STUDENT DATA INPUT:
[The student sent an image snippet of a scanned page, please extract the selected part, read it, and explain it based on the constraints above.]`;

            const requestBody = {
                contents: [{
                    parts: [
                        { text: prompt },
                        { inline_data: { mime_type: file.type || "image/jpeg", data: base64Data } }
                    ]
                }]
            };

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) throw new Error(`Server error: ${response.status}`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let accumulated = '';

            Sidebar.clearContent();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const dataStr = line.slice(6).trim();
                        if (dataStr === '[DONE]') break;
                        const data = JSON.parse(dataStr);
                        if (data.candidates && data.candidates[0].content) {
                            const textPart = data.candidates[0].content.parts.find(p => p.text);
                            if (textPart) {
                                accumulated += textPart.text;
                                Sidebar.setMarkdown(accumulated);
                            }
                        }
                    } catch (e) { /* skip */ }
                }
            }
            Toast.show('✅ اكتمل تحليل الصورة', 'success');
        } catch (err) {
            Sidebar.setContent(`<p style="color:var(--accent-rose)">❌ خطأ: ${err.message}</p>`);
        }
    }

    /**
     * Trigger full PDF analysis via Gemini API directly.
     */
    async function analyzeFullPDF() {
        const file = handlePDF._currentFile;
        if (!file) {
            Toast.show('يرجى رفع ملف PDF أولاً', 'error');
            return;
        }

        Sidebar.open();
        Sidebar.setLoading('📄 جارٍ تحليل المستند بالكامل...');

        try {
            const base64Data = await fileToBase64(file);
            const prompt = `حلّل هذا المستند الأكاديمي PDF بشكل شامل. قدّم ما يلي:

## 📋 ملخص شامل
قدّم ملخصاً مفصلاً لأهم المواضيع والحجج الرئيسية في المستند بالعربية.

## 🔑 النقاط الرئيسية
اذكر أهم 5-7 مفاهيم أو نتائج رئيسية في شكل نقاط.

## 📝 أسئلة للمراجعة (بطاقات تعليمية)
أنشئ 5 أسئلة اختبارية مع إجاباتها بناءً على المحتوى:
- **س:** [السؤال]
- **ج:** [الإجابة]

استخدم تنسيق Markdown واضح ومنظم.`;

            const requestBody = {
                contents: [{
                    parts: [
                        { text: prompt },
                        { inline_data: { mime_type: "application/pdf", data: base64Data } }
                    ]
                }]
            };

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) throw new Error(`Server error: ${response.status}`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let accumulated = '';

            Sidebar.clearContent();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const dataStr = line.slice(6).trim();
                        if (dataStr === '[DONE]') break;
                        const data = JSON.parse(dataStr);
                        if (data.candidates && data.candidates[0].content) {
                            const textPart = data.candidates[0].content.parts.find(p => p.text);
                            if (textPart) {
                                accumulated += textPart.text;
                                Sidebar.setMarkdown(accumulated);
                            }
                        }
                    } catch (e) { /* skip */ }
                }
            }
            Toast.show('✅ اكتمل تحليل المستند', 'success');
        } catch (err) {
            Sidebar.setContent(`<p style="color:var(--accent-rose)">❌ خطأ: ${err.message}</p>`);
        }
    }

    /**
     * Reset UI back to the upload zone.
     */
    function resetToUpload() {
        uploadZone.style.display = 'flex';
        document.getElementById('pdf-viewer').style.display = 'none';
        document.getElementById('image-viewer').style.display = 'none';
        fileInput.value = '';
        handlePDF._currentFile = null;
        handleImage._currentFile = null;
    }

    return { init, handleFile, analyzeFullPDF, resetToUpload };
})();
