/**
 * popup.js — Floating AI Popup Manager
 * Handles showing/hiding the contextual AI popup, streaming content, and TTS.
 */

const Popup = (() => {

    let popupEl, bodyEl, ttsBtn, closeBtn;
    let currentUtterance = null;
    let fullResponseText = '';
    let currentAbortController = null;

    function init() {
        popupEl = document.getElementById('ai-popup');
        bodyEl = document.getElementById('popup-body');
        ttsBtn = document.getElementById('popup-tts');
        closeBtn = document.getElementById('popup-close');

        closeBtn.addEventListener('click', hide);
        ttsBtn.addEventListener('click', speakResponse);

        // Close popup when clicking outside
        document.addEventListener('mousedown', (e) => {
            if (popupEl.classList.contains('visible') && !popupEl.contains(e.target)) {
                hide();
            }
        });
    }

    /**
     * Show the popup near the selected text and stream AI explanation.
     * @param {string} text - The selected text
     * @param {DOMRect} rect - Bounding rect of the selection
     */
    function show(text, rect) {
        if (!text || text.length < 2) return;

        fullResponseText = '';
        stopSpeaking();

        // Position popup above or below the selection
        const popupW = 380;
        const popupH = 300;
        let x = rect.left + rect.width / 2 - popupW / 2;
        let y = rect.top - popupH - 12;

        // If not enough space above, show below
        if (y < 80) {
            y = rect.bottom + 12;
            popupEl.classList.remove('arrow-bottom');
            popupEl.classList.add('arrow-top');
        } else {
            popupEl.classList.remove('arrow-top');
            popupEl.classList.add('arrow-bottom');
        }

        // Keep within viewport
        x = Math.max(8, Math.min(x, window.innerWidth - popupW - 8));
        y = Math.max(72, Math.min(y, window.innerHeight - popupH - 8));

        popupEl.style.left = x + 'px';
        popupEl.style.top = y + 'px';

        // Show loading state
        bodyEl.innerHTML = `
            <div class="popup-loading">
                <div class="dot-loader"><span></span><span></span><span></span></div>
            </div>`;
        popupEl.classList.add('visible');

        // Stream AI response
        streamExplanation(text);
    }

    function hide() {
        popupEl.classList.remove('visible');
        stopSpeaking();
        // Cancel ongoing fetch
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
        // Clear text selection to prevent immediately reopening
        window.getSelection().removeAllRanges();
    }

    const GEMINI_API_KEY = 'AIzaSyDxqlnHr9ByyV1gKTqChTIqVQcCtOxRxxg';

    /**
     * Stream explanation from the Gemini API.
     */
    async function streamExplanation(text) {
        if (currentAbortController) {
            currentAbortController.abort();
        }
        currentAbortController = new AbortController();

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
"${text}"`;

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
                signal: currentAbortController.signal
            });

            if (!response.ok) throw new Error(`Server error: ${response.status}`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let accumulated = '';

            // Clear loading indicator
            bodyEl.innerHTML = '';

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
                                fullResponseText = accumulated;
                                bodyEl.innerHTML = marked.parse(accumulated);
                                bodyEl.scrollTop = bodyEl.scrollHeight;
                            }
                        }
                    } catch (parseErr) { /* skip malformed lines */ }
                }
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                bodyEl.innerHTML = `<p style="color:var(--accent-rose)">❌ خطأ في الاتصال: ${err.message}</p>`;
            }
        } finally {
            if (currentAbortController && !currentAbortController.signal.aborted) {
                currentAbortController = null;
            }
        }
    }

    /**
     * Feature B: Read AI explanation aloud using Web Speech API.
     */
    function speakResponse() {
        if (!fullResponseText) return;

        if (window.speechSynthesis.speaking) {
            stopSpeaking();
            return;
        }

        // Strip markdown formatting for cleaner speech
        const plainText = fullResponseText
            .replace(/[#*_`~\[\]()>]/g, '')
            .replace(/\n+/g, '. ')
            .trim();

        currentUtterance = new SpeechSynthesisUtterance(plainText);

        // Try to detect language for appropriate voice
        const isArabic = /[\u0600-\u06FF]/.test(plainText);
        currentUtterance.lang = isArabic ? 'ar-SA' : 'en-US';
        currentUtterance.rate = 0.9;
        currentUtterance.pitch = 1;

        // Try to find a good voice
        let voices = window.speechSynthesis.getVoices();
        const targetLang = currentUtterance.lang.split('-')[0];
        let voice = voices.find(v => v.lang.startsWith(targetLang));
        if (!voice && isArabic) {
            voice = voices.find(v => v.lang.includes('ar'));
        }
        if (voice) currentUtterance.voice = voice;

        // Visual feedback on TTS button
        ttsBtn.style.color = 'var(--accent-emerald)';

        currentUtterance.onend = () => {
            ttsBtn.style.color = '';
        };

        currentUtterance.onerror = (e) => {
            console.error('Speech synthesis error:', e);
            ttsBtn.style.color = '';
        };

        try {
            window.speechSynthesis.speak(currentUtterance);

            // Workaround for Chrome bug where long speech stops suddenly
            if (isArabic && plainText.length > 200) {
                let r = setInterval(() => {
                    if (!window.speechSynthesis.speaking) {
                        clearInterval(r);
                    } else {
                        window.speechSynthesis.pause();
                        window.speechSynthesis.resume();
                    }
                }, 10000);
            }
        } catch (e) { console.error('Speech synthesis speak error:', e); }
    }

    function stopSpeaking() {
        try {
            window.speechSynthesis.cancel();
        } catch (e) { }
        if (ttsBtn) ttsBtn.style.color = '';
    }

    return { init, show, hide };
})();
