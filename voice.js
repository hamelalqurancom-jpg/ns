/**
 * voice.js — Voice Commands Module (Speech-to-Text)
 * Feature C: Records voice via SpeechRecognition API, sends query to Gemini.
 */

const Voice = (() => {
    const API_BASE = 'http://127.0.0.1:8000';
    let overlay, modal, micIcon, statusEl, transcriptEl, cancelBtn, sendBtn, micBtn;
    let recognition = null;
    let finalTranscript = '';
    let isListening = false;

    function init() {
        overlay = document.getElementById('voice-overlay');
        modal = document.getElementById('voice-modal');
        micIcon = document.getElementById('voice-mic-icon');
        statusEl = document.getElementById('voice-status');
        transcriptEl = document.getElementById('voice-transcript');
        cancelBtn = document.getElementById('voice-cancel');
        sendBtn = document.getElementById('voice-send');
        micBtn = document.getElementById('mic-btn');

        // Header mic button opens voice modal
        micBtn.addEventListener('click', openModal);
        cancelBtn.addEventListener('click', closeModal);
        sendBtn.addEventListener('click', sendQuery);
        micIcon.addEventListener('click', toggleListening);

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });

        // Init SpeechRecognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'ar-SA'; // Default to Arabic

            recognition.onresult = (event) => {
                let interim = '';
                finalTranscript = '';
                for (let i = 0; i < event.results.length; i++) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interim += event.results[i][0].transcript;
                    }
                }
                transcriptEl.textContent = finalTranscript || interim;
                sendBtn.disabled = !finalTranscript.trim();
            };

            recognition.onend = () => {
                if (isListening) {
                    // Auto-stopped, update UI
                    stopListening();
                }
            };

            recognition.onerror = (e) => {
                console.error('Speech recognition error:', e.error);
                statusEl.textContent = 'خطأ في التعرف على الصوت. حاول مرة أخرى.';
                stopListening();
            };
        }
    }

    function openModal() {
        finalTranscript = '';
        transcriptEl.textContent = '';
        statusEl.textContent = 'انقر على الميكروفون للتحدث...';
        sendBtn.disabled = true;
        overlay.classList.add('visible');

        // Auto-start listening
        startListening();
    }

    function closeModal() {
        stopListening();
        overlay.classList.remove('visible');
    }

    function toggleListening() {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    }

    function startListening() {
        if (!recognition) {
            statusEl.textContent = 'المتصفح لا يدعم التعرف على الصوت';
            return;
        }
        isListening = true;
        finalTranscript = '';
        transcriptEl.textContent = '';

        micIcon.classList.add('listening');
        micBtn.classList.add('recording');
        statusEl.textContent = '🔴 جارٍ الاستماع...';

        try {
            recognition.start();
        } catch (e) {
            // Already started
        }
    }

    function stopListening() {
        isListening = false;
        micIcon.classList.remove('listening');
        micBtn.classList.remove('recording');
        statusEl.textContent = finalTranscript ? 'اضغط إرسال أو تحدث مرة أخرى' : 'انقر على الميكروفون للتحدث...';

        try {
            recognition?.stop();
        } catch (e) { /* ignore */ }
    }

    const GEMINI_API_KEY = 'AIzaSyDxqlnHr9ByyV1gKTqChTIqVQcCtOxRxxg';

    /**
     * Send transcribed query to Gemini directly.
     * Response is displayed in the sidebar.
     */
    async function sendQuery() {
        const query = finalTranscript.trim();
        if (!query) return;

        closeModal();
        Toast.show('جارٍ معالجة سؤالك الصوتي...', 'info');

        // Open sidebar and show loading
        Sidebar.open();
        Sidebar.setLoading('🎙️ السؤال الصوتي');

        const page_context = PDFViewer.getCurrentPageText?.() || '';
        
        const prompt = `أنت مُعلّم أكاديمي خبير. سأل الطالب السؤال التالي بالصوت أثناء دراسته:

"${query}"

${page_context ? "سياق الصفحة الحالية: " + page_context : ""}

قدّم إجابة واضحة ومفيدة بالعربية (مع المصطلحات الإنجليزية التقنية عند الحاجة).
اجعل الإجابة مختصرة وتعليمية. استخدم تنسيق Markdown.`;

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });

            if (!response.ok) throw new Error(`Server error: ${response.status}`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let accumulated = '';

            Sidebar.clearContent();
            Sidebar.appendRaw(`<div class="voice-query-badge">🎙️ "${query}"</div><hr style="border-color:var(--border-subtle);margin:12px 0">`);

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
                                Sidebar.setMarkdown(accumulated,
                                    `<div class="voice-query-badge">🎙️ "${query}"</div><hr style="border-color:var(--border-subtle);margin:12px 0">`
                                );
                            }
                        }
                    } catch (e) { /* skip */ }
                }
            }
        } catch (err) {
            Sidebar.setContent(`<p style="color:var(--accent-rose)">❌ خطأ: ${err.message}</p>`);
        }
    }

    return { init, openModal, closeModal };
})();
