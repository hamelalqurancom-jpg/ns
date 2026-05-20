/**
 * server.js — AcademiQ AI Backend (Node.js / Express)
 * ════════════════════════════════════════════════════
 * بديل كامل لـ main.py بالـ JavaScript
 *
 * Endpoints:
 *  POST /api/explain         — شرح نص محدد (SSE streaming)
 *  POST /api/voice-query     — إجابة سؤال صوتي (SSE streaming)
 *  POST /api/upload-pdf      — رفع PDF للتحليل
 *  POST /api/analyze-pdf/:id — تحليل PDF كامل (SSE streaming)
 *  POST /api/analyze-image   — تحليل صورة (SSE streaming)
 *  GET  /*                   — serve الـ Frontend (HTML / CSS / JS)
 */

import express        from 'express';
import multer         from 'multer';
import path           from 'path';
import fs             from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv         from 'dotenv';

// ── Setup ────────────────────────────────────────────────────────────────────
dotenv.config({ path: '.env' });

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const app        = express();
const PORT       = process.env.PORT || 8000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const MODEL_NAME = 'gemini-2.5-flash';     // ✅ أحدث موديل

// ── Gemini Setup ──────────────────────────────────────────────────────────────
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    console.warn('⚠️  GEMINI_API_KEY مش موجود في .env');
} else {
    console.log('✅ Gemini API Key loaded');
}

const genAI = new GoogleGenerativeAI(API_KEY || '');

function getModel() {
    return genAI.getGenerativeModel({ model: MODEL_NAME });
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Multer (رفع الملفات) ──────────────────────────────────────────────────────
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename:    (req, file, cb) => {
        const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const ext    = path.extname(file.originalname).toLowerCase();
        cb(null, `${unique}${ext}`);
    }
});

const uploadMiddleware = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) cb(null, true);
        else cb(new Error(`نوع الملف غير مدعوم: ${ext}`));
    }
});

// ── Helper: SSE Headers ───────────────────────────────────────────────────────
function setSSEHeaders(res) {
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
}

function sendSSE(res, data) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ── الـ System Prompt المشترك (المعلم المصري) ─────────────────────────────────
const TUTOR_PROMPT = `You are the core AI engine of AcademiQ AI, an innovative educational platform. Your role is to act as an expert, highly engaging Egyptian private tutor (مدرس خصوصي شاطر، محبوك ومسهل للمناهج).

1. PERSONA & TONE:
   - Speak like a witty, supportive Egyptian private tutor.
   - Use friendly Egyptian Arabic (اللهجة المصرية العامية المبسطة).
   - Avoid formal Arabic (الفصحى الجافة) unless quoting a scientific law.

2. MOBILE UI CONSTRAINTS:
   - Ultra-concise, 3–4 lines max.
   - Use Markdown: bold key terms, short bullets if needed.

3. PEDAGOGICAL APPROACH:
   - Target the exact confusion point.
   - Use Egyptian cultural analogies when possible.
   - Explain *why*, not just *what*.

4. OUTPUT TEMPLATE:
   - Lines 1–3: breakdown + analogy (Markdown).
   - Line 4: Egyptian tutor catchphrase (e.g., "وصلت يا دكتور؟", "سهلة ولوز العنب أهي!", "فهمت اللعبة ماشية إزاي يا بطل؟").`;


// ══════════════════════════════════════════════════════════════════════════════
//  POST /api/explain — شرح نص محدد من الـ PDF
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/explain', async (req, res) => {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ detail: 'لم يتم إرسال نص' });

    setSSEHeaders(res);

    const prompt = `${TUTOR_PROMPT}\n\nSTUDENT DATA INPUT:\n"${text}"`;

    try {
        const model  = getModel();
        const result = await model.generateContentStream(prompt);

        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            if (chunkText) sendSSE(res, { text: chunkText });
        }
        sendSSE(res, { done: true });
    } catch (err) {
        console.error('[/api/explain]', err.message);
        sendSSE(res, { error: err.message });
    } finally {
        res.end();
    }
});


// ══════════════════════════════════════════════════════════════════════════════
//  POST /api/voice-query — إجابة سؤال صوتي
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/voice-query', async (req, res) => {
    const { query, page_context } = req.body;
    if (!query?.trim()) return res.status(400).json({ detail: 'لم يتم إرسال سؤال' });

    setSSEHeaders(res);

    const prompt = `أنت مُعلّم أكاديمي خبير. سأل الطالب السؤال التالي بالصوت أثناء دراسته:

"${query}"

${page_context ? `سياق الصفحة الحالية:\n${page_context}` : ''}

قدّم إجابة واضحة ومفيدة بالعربية (مع المصطلحات الإنجليزية التقنية عند الحاجة).
اجعل الإجابة مختصرة وتعليمية. استخدم تنسيق Markdown.`;

    try {
        const model  = getModel();
        const result = await model.generateContentStream(prompt);

        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            if (chunkText) sendSSE(res, { text: chunkText });
        }
        sendSSE(res, { done: true });
    } catch (err) {
        console.error('[/api/voice-query]', err.message);
        sendSSE(res, { error: err.message });
    } finally {
        res.end();
    }
});


// ══════════════════════════════════════════════════════════════════════════════
//  POST /api/upload-pdf — رفع PDF وإرجاع file_id
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/upload-pdf', uploadMiddleware.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ detail: 'لم يتم إرسال ملف' });

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (ext !== '.pdf') {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ detail: 'يُسمح بملفات PDF فقط' });
    }

    // نحتفظ بالـ file_id (اسم الملف بدون امتداد)
    const fileId = path.basename(req.file.filename, ext);
    console.log(`📄 PDF uploaded: ${req.file.originalname} → ${fileId}`);

    res.json({ file_id: fileId, filename: req.file.originalname });
});


// ══════════════════════════════════════════════════════════════════════════════
//  POST /api/analyze-pdf/:file_id — تحليل PDF بالكامل
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/analyze-pdf/:file_id', async (req, res) => {
    const { file_id } = req.params;

    // ابحث عن الملف في مجلد uploads
    const files   = fs.readdirSync(UPLOAD_DIR);
    const match   = files.find(f => f.startsWith(file_id));
    if (!match) return res.status(404).json({ detail: 'الملف غير موجود' });

    const filePath = path.join(UPLOAD_DIR, match);
    setSSEHeaders(res);

    const prompt = `حلّل هذا المستند الأكاديمي PDF بشكل شامل. قدّم ما يلي:

## 📋 ملخص شامل
قدّم ملخصاً مفصلاً لأهم المواضيع والحجج الرئيسية في المستند بالعربية.

## 🔑 النقاط الرئيسية
اذكر أهم 5–7 مفاهيم أو نتائج رئيسية في شكل نقاط.

## 📝 أسئلة للمراجعة (بطاقات تعليمية)
أنشئ 5 أسئلة اختبارية مع إجاباتها بناءً على المحتوى:
- **س:** [السؤال]
- **ج:** [الإجابة]

استخدم تنسيق Markdown واضح ومنظم.`;

    try {
        // قراءة الملف وتحويله لـ base64
        const fileData   = fs.readFileSync(filePath);
        const base64Data = fileData.toString('base64');

        const model  = getModel();
        const result = await model.generateContentStream([
            { text: prompt },
            { inlineData: { mimeType: 'application/pdf', data: base64Data } }
        ]);

        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            if (chunkText) sendSSE(res, { text: chunkText });
        }
        sendSSE(res, { done: true });
    } catch (err) {
        console.error('[/api/analyze-pdf]', err.message);
        sendSSE(res, { error: err.message });
    } finally {
        res.end();
    }
});


// ══════════════════════════════════════════════════════════════════════════════
//  POST /api/analyze-image — تحليل صورة بالـ Vision
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/analyze-image', uploadMiddleware.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ detail: 'لم يتم إرسال صورة' });

    const allowedMimes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!allowedMimes.includes(req.file.mimetype)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ detail: 'نوع الصورة غير مدعوم' });
    }

    setSSEHeaders(res);

    const prompt = `${TUTOR_PROMPT}

STUDENT DATA INPUT:
[الطالب أرسل صورة من صفحة ملزمة أو PDF ممسوح ضوئياً. اقرأ المحتوى المرئي وشرح المفهوم الرئيسي فيه مباشرة بناءً على التعليمات أعلاه.]`;

    try {
        const fileData   = fs.readFileSync(req.file.path);
        const base64Data = fileData.toString('base64');

        const model  = getModel();
        const result = await model.generateContentStream([
            { text: prompt },
            { inlineData: { mimeType: req.file.mimetype, data: base64Data } }
        ]);

        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            if (chunkText) sendSSE(res, { text: chunkText });
        }
        sendSSE(res, { done: true });
    } catch (err) {
        console.error('[/api/analyze-image]', err.message);
        sendSSE(res, { error: err.message });
    } finally {
        // حذف الصورة المؤقتة بعد التحليل
        try { fs.unlinkSync(req.file.path); } catch (_) {}
        res.end();
    }
});


// ══════════════════════════════════════════════════════════════════════════════
//  Serve Frontend Static Files
// ══════════════════════════════════════════════════════════════════════════════
app.use(express.static(__dirname));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});


// ── Error Handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('[Server Error]', err.message);
    res.status(err.status || 500).json({ detail: err.message });
});


// ── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════╗
║   AcademiQ AI — Node.js Server     ║
║   http://localhost:${PORT}            ║
║   Model: ${MODEL_NAME}      ║
╚════════════════════════════════════╝`);
});
