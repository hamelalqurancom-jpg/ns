"""
AcademiQ AI — Backend Server
FastAPI server handling Gemini API integration, file uploads, and streaming responses.
"""

import os
import json
import uuid
import shutil
import logging
import io
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
import google.generativeai as genai

# ── Setup ────────────────────────────────────────────────────────────────────
load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("academiq")

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# ── Gemini Configuration ────────────────────────────────────────────────────
API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    logger.warning("⚠️  GEMINI_API_KEY not found in environment. Set it in backend/.env")
else:
    genai.configure(api_key=API_KEY)
    logger.info("✅ Gemini API configured successfully")

# Trigger reload
MODEL_NAME = "gemini-1.5-flash"

def get_model():
    """Get a fresh model instance."""
    return genai.GenerativeModel(MODEL_NAME)

# ── FastAPI App ──────────────────────────────────────────────────────────────
app = FastAPI(title="AcademiQ AI", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Serve Frontend ───────────────────────────────────────────────────────────
FRONTEND_DIR = Path(__file__).resolve().parent

# ── API ENDPOINTS ────────────────────────────────────────────────────────────

@app.post("/api/explain")
async def explain_text(request: Request):
    """
    Feature A: Receive highlighted text from the PDF viewer.
    Sends it to Gemini with academic prompt wrapping, streams the response back via SSE.
    """
    body = await request.json()
    text = body.get("text", "").strip()

    if not text:
        raise HTTPException(status_code=400, detail="No text provided")

    prompt = f"""You are the core AI engine of AcademiQ AI, an innovative educational platform. Your role is to act as an expert, highly engaging Egyptian private tutor (مدرس خصوصي شاطر، محبوك ومسهل للمناهج). You will receive either a snippet of text or an image from a document that a student has interacted with via text selection or long-press on their mobile screen.

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
"{text}"
"""

    async def generate():
        try:
            model = get_model()
            response = model.generate_content(prompt, stream=True)
            for chunk in response:
                if chunk.text:
                    yield f"data: {json.dumps({'text': chunk.text}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            logger.error(f"Explain error: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/api/voice-query")
async def voice_query(request: Request):
    """
    Feature C: Process a voice-transcribed query from the student.
    Accepts text query + optional page context, streams Gemini response.
    """
    body = await request.json()
    query = body.get("query", "").strip()
    page_context = body.get("page_context", "")

    if not query:
        raise HTTPException(status_code=400, detail="No query provided")

    prompt = f"""أنت مُعلّم أكاديمي خبير. سأل الطالب السؤال التالي بالصوت أثناء دراسته:

"{query}"

{"سياق الصفحة الحالية: " + page_context if page_context else ""}

قدّم إجابة واضحة ومفيدة بالعربية (مع المصطلحات الإنجليزية التقنية عند الحاجة).
اجعل الإجابة مختصرة وتعليمية. استخدم تنسيق Markdown."""

    async def generate():
        try:
            model = get_model()
            response = model.generate_content(prompt, stream=True)
            for chunk in response:
                if chunk.text:
                    yield f"data: {json.dumps({'text': chunk.text}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            logger.error(f"Voice query error: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/api/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):
    """
    Feature D: Upload a PDF file for storage and later analysis.
    Returns a file_id the frontend uses to request analysis.
    """
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    file_id = str(uuid.uuid4())
    file_path = UPLOAD_DIR / f"{file_id}.pdf"

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    logger.info(f"PDF uploaded: {file.filename} -> {file_id}")
    return JSONResponse({"file_id": file_id, "filename": file.filename})


@app.post("/api/analyze-pdf/{file_id}")
async def analyze_pdf(file_id: str):
    """
    Feature D: Analyze an uploaded PDF using Gemini Files API.
    Generates summary, key takeaways, and flashcard quiz questions. Streams result.
    """
    file_path = UPLOAD_DIR / f"{file_id}.pdf"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    prompt = """حلّل هذا المستند الأكاديمي PDF بشكل شامل. قدّم ما يلي:

## 📋 ملخص شامل
قدّم ملخصاً مفصلاً لأهم المواضيع والحجج الرئيسية في المستند بالعربية.

## 🔑 النقاط الرئيسية
اذكر أهم 5-7 مفاهيم أو نتائج رئيسية في شكل نقاط.

## 📝 أسئلة للمراجعة (بطاقات تعليمية)
أنشئ 5 أسئلة اختبارية مع إجاباتها بناءً على المحتوى:
- **س:** [السؤال]
- **ج:** [الإجابة]

استخدم تنسيق Markdown واضح ومنظم."""

    async def generate():
        try:
            # Upload file to Gemini Files API
            gemini_file = genai.upload_file(str(file_path))
            model = get_model()
            response = model.generate_content([gemini_file, prompt], stream=True)
            for chunk in response:
                if chunk.text:
                    yield f"data: {json.dumps({'text': chunk.text}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            logger.error(f"PDF analysis error: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/api/analyze-image")
async def analyze_image(file: UploadFile = File(...)):
    """
    Feature D: Analyze an uploaded image using Gemini Vision.
    Performs OCR, solves equations, explains diagrams. Streams result.
    """
    allowed = {'.png', '.jpg', '.jpeg', '.webp', '.gif'}
    ext = Path(file.filename).suffix.lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported image type. Allowed: {allowed}")

    contents = await file.read()

    import PIL.Image
    image = PIL.Image.open(io.BytesIO(contents))

    prompt = f"""You are the core AI engine of AcademiQ AI, an innovative educational platform. Your role is to act as an expert, highly engaging Egyptian private tutor (مدرس خصوصي شاطر، محبوك ومسهل للمناهج). You will receive either a snippet of text or an image from a document that a student has interacted with via text selection or long-press on their mobile screen.

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
[The student sent an image snippet of a scanned page, please extract the selected part, read it, and explain it based on the constraints above.]
"""

    async def generate():
        try:
            model = get_model()
            response = model.generate_content([prompt, image], stream=True)
            for chunk in response:
                if chunk.text:
                    yield f"data: {json.dumps({'text': chunk.text}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            logger.error(f"Image analysis error: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# ── Serve Frontend Static Files ─────────────────────────────────────────────
@app.get("/")
async def serve_root():
    return FileResponse(str(FRONTEND_DIR / "index.html"))

@app.get("/{path:path}")
async def serve_static(path: str):
    """Serve frontend static files (HTML, CSS, JS)."""
    file_path = FRONTEND_DIR / path
    if file_path.exists() and file_path.is_file():
        return FileResponse(str(file_path))
    return FileResponse(str(FRONTEND_DIR / "index.html"))


# ── Entry Point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
