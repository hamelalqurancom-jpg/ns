const logs = [
    "Attempting SSH injection: [SUCCESS]",
    "Escalating privileges to ROOT...",
    "Decrypting WhatsApp database (SQLite)...",
    "Bypassing FaceID/Pattern lock security...",
    "Accessing Private Cloud Storage...",
    "Cloning personal photos to remote mirror...",
    "Intercepting incoming SMS messages...",
    "Extracting Banking/OTP history...",
    "Installing Remote Access Trojan (RAT)...",
    "Encrypting local storage with RSA-4096...",
    "Deleting system backup partitions...",
    "Sending data to C&C Server: 103.45.21.9",
    "Wiping authentication logs...",
    "FATAL ERROR: SYSTEM CONTROL LOST"
];

let logIndex = 0;
let progress = 0;

function startPrank() {
    // Attempt Fullscreen
    try {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
        }
    } catch (e) { }

    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('prank-container').classList.remove('hidden');
    document.getElementById('overlay').style.display = 'block';

    // Vibration
    if (navigator.vibrate) {
        navigator.vibrate([500, 200, 500, 200, 1000]);
    }

    updatePrank();
}

function updatePrank() {
    const bar = document.getElementById('bar');
    const statusMsg = document.getElementById('status-msg');
    const terminal = document.getElementById('terminal');

    const interval = setInterval(() => {
        progress += Math.random() * 2;
        if (progress > 100) progress = 100;

        bar.style.width = progress.toFixed(1) + '%';

        if (progress < 25) statusMsg.innerText = "جاري كسر شفرة الحماية الرئيسية...";
        else if (progress < 50) statusMsg.innerText = "تم الوصول لملفات الصور والمحادثات الشخصية...";
        else if (progress < 75) statusMsg.innerText = "جاري تشفير كافة البيانات ومنع الوصول إليها...";
        else if (progress < 95) statusMsg.innerText = "جاري رفع الملفات للسيرفر المجهول (4.8GB)...";
        else statusMsg.innerText = "اكتملت العملية: جاري قفل النظام بالكامل...";

        if (Math.random() > 0.6 && logIndex < logs.length) {
            const entry = document.createElement('span');
            entry.className = 'log-entry';
            entry.innerText = '> ' + logs[logIndex];
            terminal.appendChild(entry);
            terminal.scrollTop = terminal.scrollHeight;
            logIndex++;
        }

        if (progress >= 100) {
            clearInterval(interval);
            document.body.classList.add('shake');
            document.getElementById('main-title').innerText = "تم اختراقك بنجاح";
            statusMsg.innerText = "تم تشفير كافة ملفاتك. سيتم حذفها تلقائياً بعد 24 ساعة.";
            document.getElementById('overlay').style.animation = 'flicker 0.05s infinite';
            document.getElementById('overlay').style.background = 'rgba(255, 0, 0, 0.6)';

            setTimeout(() => {
                document.body.innerHTML = `
                    <div class="container" style="border-color: #fff; background: #000; animation: none;">
                        <div class="icon" style="color: #fff;">☠️</div>
                        <h1 style="color: #fff; font-size: 3rem;">SYSTEM LOCKED</h1>
                        <p style="color: #f00; font-size: 1.5rem; font-weight: bold; margin: 20px 0;">تم فقدان السيطرة على الجهاز</p>
                        <p style="color: #aaa; direction: rtl;">لا تحاول إغلاق الصفحة أو إعادة تشغيل الجهاز، سيؤدي ذلك إلى حذف البيانات فوراً.</p>
                        <div style="margin-top: 30px; font-family: monospace; color: #555;">ERROR_CODE: 0x8004100E_CRITICAL_FAILURE</div>
                    </div>
                `;
                document.body.style.background = "#000";
            }, 2000);
        }
    }, 150);
}
