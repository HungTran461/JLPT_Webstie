pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let appData = null;
let currentExam = null;

const SECTION_KEYS = ['moji_goi', 'bunpou', 'choukai'];
let currentSectionIndex = 0; 

let pdfCache = {}; 
let masterPdfDoc = null;
let currentPdfUrl = '';
let currentPdfPage = 1;
let currentPdfScale = 1.2;

let sectionTimerInterval = null;
let sectionTimeRemaining = 0;

let currentSession = {
    answers: { moji_goi: {}, bunpou: {}, choukai: {} },
    graded: { moji_goi: false, bunpou: false, choukai: false },
    scores: { moji_goi: null, bunpou: null, choukai: null }
};

const audioPlayer = document.getElementById('choukai-player');
const playAudioBtn = document.getElementById('btn-play-audio');

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    try {
        const res = await fetch('data/jlpt_data.json');
        appData = await res.json();

        setupExamInfo();
        startCountdown();

        renderHomeExamsGrid();
        renderHistoryTable();

        initEventListeners();
    } catch (err) {
        console.error("Lỗi khi nạp dữ liệu JSON:", err);
    }
}

function setupExamInfo() {
    if (!appData.exam_info) return;
    const info = appData.exam_info;
    document.getElementById('exam-title').textContent = info.next_exam_name;
    document.getElementById('exam-date').textContent = new Date(info.next_exam_date).toLocaleDateString('vi-VN');
    document.getElementById('exam-location').textContent = info.location;
}

function startCountdown() {
    if (!appData.exam_info) return;

    function updateTimer() {
        const targetDate = new Date(appData.exam_info.next_exam_date).getTime();
        const diff = targetDate - new Date().getTime();

        if (diff <= 0) return;

        document.getElementById('days').textContent = String(Math.floor(diff / (1000 * 60 * 60 * 24))).padStart(2, '0');
        document.getElementById('hours').textContent = String(Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))).padStart(2, '0');
        document.getElementById('minutes').textContent = String(Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))).padStart(2, '0');
        document.getElementById('seconds').textContent = String(Math.floor((diff % (1000 * 60)) / 1000)).padStart(2, '0');
    }

    updateTimer();
    setInterval(updateTimer, 1000);
}

function renderHomeExamsGrid() {
    const grid = document.getElementById('exam-cards-grid');
    grid.innerHTML = '';

    appData.exams.forEach(exam => {
        const card = document.createElement('div');
        card.className = "bg-slate-800 border border-slate-700 hover:border-amber-400/50 p-5 rounded-2xl shadow-xl flex flex-col justify-between space-y-4 transition group";
        
        card.innerHTML = `
            <div>
                <div class="flex justify-between items-start mb-2">
                    <span class="px-2.5 py-1 bg-amber-500/10 text-amber-400 font-extrabold text-xs rounded-lg border border-amber-500/20">${exam.level}</span>
                    <span class="text-xs text-slate-400 font-mono">${exam.id}</span>
                </div>
                <h3 class="text-lg font-bold text-white group-hover:text-amber-300 transition">${exam.name}</h3>
                <p class="text-xs text-slate-400 mt-1">Trình tự: Moji-Goi ➔ Bunpou ➔ Choukai (Có đếm giờ từng phần).</p>
            </div>
            <button class="btn-start-exam w-full py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2" data-id="${exam.id}">
                <i class="fa-solid fa-play"></i> BẮT ĐẦU LÀM BÀI
            </button>
        `;

        card.querySelector('.btn-start-exam').addEventListener('click', () => {
            openExamWorkspace(exam.id);
        });

        grid.appendChild(card);
    });
}

// MỞ KHÔNG GIAN LÀM BÀI -> TỰ ĐỘNG RESET SESSION MỚI TINH
async function openExamWorkspace(examId) {
    currentExam = appData.exams.find(e => e.id === examId);
    if (!currentExam) return;

    // Tự động Reset sạch dữ liệu lượt thi cũ mỗi lần bấm "Bắt đầu làm bài"
    currentSession = {
        answers: { moji_goi: {}, bunpou: {}, choukai: {} },
        graded: { moji_goi: false, bunpou: false, choukai: false },
        scores: { moji_goi: null, bunpou: null, choukai: null }
    };
    localStorage.removeItem(`jlpt_session_${examId}`);

    document.getElementById('active-exam-title').textContent = `${currentExam.name} (${currentExam.level})`;
    document.getElementById('sheet-exam-title').textContent = currentExam.id;

    if (currentExam.choukai_audio) {
        audioPlayer.src = currentExam.choukai_audio;
    } else {
        audioPlayer.removeAttribute('src');
    }

    document.getElementById('home-view').classList.add('hidden');
    document.getElementById('exam-view').classList.remove('hidden');

    currentSectionIndex = 0;
    loadCurrentSection();
}

function loadCurrentSection() {
    stopSectionTimer();
    const currentKey = SECTION_KEYS[currentSectionIndex];

    updateSectionIndicators();
    renderOMRSheet();

    if (!currentSession.graded[currentKey]) {
        const secData = currentExam.sections[currentKey];
        const minutes = (secData && secData.time_limit) ? secData.time_limit : 20;
        startSectionTimer(minutes * 60);
    } else {
        document.getElementById('section-timer-display').textContent = "ĐÃ NỘP BÀI";
    }
}

function updateSectionIndicators() {
    SECTION_KEYS.forEach((key, idx) => {
        const ind = document.getElementById(`ind-${key}`);
        if (!ind) return;

        ind.className = "section-indicator px-3 py-1 rounded-lg font-bold text-xs transition ";
        if (idx === currentSectionIndex) {
            ind.className += "bg-amber-400 text-slate-950 shadow";
        } else if (currentSession.graded[key]) {
            ind.className += "bg-emerald-600/30 text-emerald-400 border border-emerald-500/30";
        } else {
            ind.className += "bg-slate-800 text-slate-500";
        }
    });
}

function startSectionTimer(seconds) {
    sectionTimeRemaining = seconds;
    updateTimerDisplay();

    sectionTimerInterval = setInterval(() => {
        sectionTimeRemaining--;
        updateTimerDisplay();

        if (sectionTimeRemaining <= 0) {
            stopSectionTimer();
            alert("⏰ Đã hết thời gian làm bài phần này! Hệ thống tự động nộp bài.");
            gradeCurrentSection();
        }
    }, 1000);
}

function stopSectionTimer() {
    if (sectionTimerInterval) {
        clearInterval(sectionTimerInterval);
        sectionTimerInterval = null;
    }
}

function updateTimerDisplay() {
    const mins = Math.floor(sectionTimeRemaining / 60);
    const secs = sectionTimeRemaining % 60;
    document.getElementById('section-timer-display').textContent = 
        `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

async function loadPDF(pdfUrl) {
    if (!pdfUrl) return;
    
    if (currentPdfUrl === pdfUrl && masterPdfDoc) {
        renderPDFPage(1);
        return;
    }

    const spinner = document.getElementById('pdf-spinner');
    if (spinner) spinner.classList.remove('hidden');

    try {
        if (!pdfCache[pdfUrl]) {
            pdfCache[pdfUrl] = await pdfjsLib.getDocument(pdfUrl).promise;
        }

        masterPdfDoc = pdfCache[pdfUrl];
        currentPdfUrl = pdfUrl;

        if (spinner) spinner.classList.add('hidden');
        renderPDFPage(1);
    } catch (err) {
        console.error("Lỗi khi nạp file PDF:", err);
        if (spinner) {
            spinner.innerHTML = `<span class="text-red-400 text-xs">Không thấy file: ${pdfUrl}</span>`;
        }
    }
}

async function renderPDFPage(pageNum) {
    if (!masterPdfDoc) return;
    currentPdfPage = pageNum;

    try {
        const page = await masterPdfDoc.getPage(pageNum);
        const canvas = document.getElementById('pdf-canvas');
        const ctx = canvas.getContext('2d');
        const viewport = page.getViewport({ scale: currentPdfScale });

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        document.getElementById('pdf-page-display').textContent = `Trang ${pageNum}/${masterPdfDoc.numPages}`;

        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    } catch (err) {
        console.error("Lỗi khi vẽ trang PDF:", err);
    }
}

function renderOMRSheet() {
    const container = document.getElementById('omr-container');
    container.innerHTML = '';

    const currentKey = SECTION_KEYS[currentSectionIndex];
    const sectionData = currentExam.sections[currentKey];

    if (!sectionData || !sectionData.problems) {
        container.innerHTML = '<p class="text-xs text-slate-500 italic">Không có dữ liệu cho phần thi này.</p>';
        return;
    }

    if (sectionData.pdf_url) {
        loadPDF(sectionData.pdf_url);
    }

    const audioBox = document.getElementById('choukai-audio-box');
    if (currentKey === 'choukai') audioBox.classList.remove('hidden');
    else audioBox.classList.add('hidden');

    const isGraded = currentSession.graded[currentKey];

    sectionData.problems.forEach((prob, probIdx) => {
        const block = document.createElement('div');
        block.className = 'omr-problem-block';

        const header = document.createElement('div');
        header.className = 'omr-problem-header';
        header.textContent = prob.title;
        block.appendChild(header);

        prob.questions.forEach(q => {
            const qKey = `${currentKey}_${probIdx}_${q.id}`;

            const row = document.createElement('div');
            row.className = 'omr-row';

            const qNum = document.createElement('span');
            qNum.className = 'omr-qnum';
            qNum.textContent = `${q.id}`;
            qNum.title = `Xem đề ở trang ${q.page}`;
            qNum.addEventListener('click', () => renderPDFPage(q.page));
            row.appendChild(qNum);

            const bubblesDiv = document.createElement('div');
            bubblesDiv.className = 'omr-bubbles';

            const count = prob.options_count || 4;
            const userPick = currentSession.answers[currentKey][qKey];

            for (let i = 0; i < count; i++) {
                const bubble = document.createElement('button');
                const uniqueBubbleClass = `bubble-${currentKey}-${probIdx}-${q.id}-${i}`;
                bubble.className = `omr-bubble ${uniqueBubbleClass}`;
                bubble.textContent = i + 1;

                if (isGraded) {
                    bubble.disabled = true;
                    if (i === q.correct) {
                        bubble.classList.add('correct');
                    } else if (i === userPick && userPick !== q.correct) {
                        bubble.classList.add('incorrect');
                    }
                } else if (userPick === i) {
                    bubble.classList.add('selected');
                }

                bubble.addEventListener('click', () => {
                    selectAnswer(qKey, i, count, currentKey, probIdx, q.id);
                });

                bubblesDiv.appendChild(bubble);
            }

            row.appendChild(bubblesDiv);
            block.appendChild(row);
        });

        container.appendChild(block);
    });

    updateActionButtonUI();
}

function selectAnswer(qKey, optionIdx, count, sectionKey, probIdx, qId) {
    if (currentSession.graded[sectionKey]) return;

    currentSession.answers[sectionKey][qKey] = optionIdx;
    saveSessionToStorage(currentExam.id);

    for (let i = 0; i < count; i++) {
        const b = document.querySelector(`.bubble-${sectionKey}-${probIdx}-${qId}-${i}`);
        if (b) b.classList.remove('selected');
    }

    const selectedBubble = document.querySelector(`.bubble-${sectionKey}-${probIdx}-${qId}-${optionIdx}`);
    if (selectedBubble) selectedBubble.classList.add('selected');
}

function gradeCurrentSection() {
    stopSectionTimer();
    const currentKey = SECTION_KEYS[currentSectionIndex];
    const sectionData = currentExam.sections[currentKey];

    if (!sectionData || !sectionData.problems) return;

    let totalQuestions = 0;
    let correctCount = 0;

    sectionData.problems.forEach((prob, probIdx) => {
        prob.questions.forEach(q => {
            totalQuestions++;
            const qKey = `${currentKey}_${probIdx}_${q.id}`;
            const userPick = currentSession.answers[currentKey][qKey];

            if (userPick === q.correct) {
                correctCount++;
            }
        });
    });

    const percent = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    
    currentSession.graded[currentKey] = true;
    currentSession.scores[currentKey] = {
        correct: correctCount,
        total: totalQuestions,
        percent: percent
    };

    saveSessionToStorage(currentExam.id);
    renderOMRSheet();

    // Khi nộp phần cuối cùng (Choukai) -> Tự động ghi vào lịch sử
    const allGraded = SECTION_KEYS.every(k => currentSession.graded[k] === true);
    if (allGraded) {
        saveSessionToHistory();
    }
}

function updateActionButtonUI() {
    const currentKey = SECTION_KEYS[currentSectionIndex];
    const isGraded = currentSession.graded[currentKey];

    const btnSubmit = document.getElementById('btn-submit-section');
    const btnNext = document.getElementById('btn-next-section');
    const btnOverall = document.getElementById('btn-view-overall-score');
    const resultBox = document.getElementById('section-score-result');

    if (isGraded) {
        btnSubmit.classList.add('hidden');

        if (currentSectionIndex < SECTION_KEYS.length - 1) {
            btnNext.classList.remove('hidden');
            btnOverall.classList.add('hidden');
        } else {
            btnNext.classList.add('hidden');
            btnOverall.classList.remove('hidden');
        }

        const score = currentSession.scores[currentKey];
        if (score) {
            resultBox.className = "bg-emerald-100 border border-emerald-400 p-3 rounded-lg text-center shadow-sm";
            resultBox.innerHTML = `
                <p class="text-[11px] text-emerald-800 font-bold uppercase">KẾT QUẢ PHẦN NÀY</p>
                <p class="text-2xl font-black text-emerald-700 mt-1">${score.correct} / ${score.total} câu (${score.percent}%)</p>
            `;
            resultBox.classList.remove('hidden');
        }
    } else {
        btnSubmit.classList.remove('hidden');
        btnNext.classList.add('hidden');
        btnOverall.classList.add('hidden');
        resultBox.classList.add('hidden');
    }
}

// XEM TỔNG ĐIỂM VÀ CÓ NÚT "HOÀN THÀNH & TRỞ VỀ MÀN HÌNH CHÍNH"
function showOverallScoreModal() {
    const modal = document.getElementById('overall-modal');
    const content = document.getElementById('overall-modal-content');

    let totalCorrect = 0;
    let totalQuestions = 0;
    let breakdownHTML = '';

    SECTION_KEYS.forEach(k => {
        const s = currentSession.scores[k];
        if (s) {
            totalCorrect += s.correct;
            totalQuestions += s.total;
            const titleShort = k === 'moji_goi' ? 'Moji - Goi' : (k === 'bunpou' ? 'Bunpou' : 'Choukai');
            breakdownHTML += `
                <div class="flex justify-between items-center text-xs py-2 border-b border-slate-800">
                    <span class="text-slate-400 font-bold">${titleShort}:</span>
                    <span class="font-mono font-bold text-amber-400">${s.correct} / ${s.total} câu (${s.percent}%)</span>
                </div>
            `;
        }
    });

    const totalPercent = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

    content.innerHTML = `
        <div class="text-center pb-3 border-b border-slate-700">
            <span class="text-3xl">🏆</span>
            <h3 class="text-lg font-black text-amber-400 uppercase tracking-wider mt-1">TỔNG ĐIỂM BÀI THI JLPT</h3>
            <p class="text-xs text-slate-400 mt-1">${currentExam.name}</p>
            <p class="text-4xl font-black text-emerald-400 my-2">${totalCorrect} / ${totalQuestions}</p>
            <p class="text-xs text-slate-300">Tỷ lệ chính xác toàn đề: <strong class="text-emerald-400">${totalPercent}%</strong></p>
        </div>
        <div class="space-y-1">
            <p class="text-[11px] text-slate-400 font-bold uppercase">Chi tiết từng phần:</p>
            ${breakdownHTML}
        </div>
        <button id="btn-finish-and-go-home" class="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition mt-4 flex items-center justify-center gap-2 shadow-lg">
            <i class="fa-solid fa-house"></i> TRỞ VỀ MÀN HÌNH CHÍNH
        </button>
    `;

    document.getElementById('btn-finish-and-go-home').addEventListener('click', closeSummaryAndReturnHome);

    modal.classList.remove('hidden');
}

// TỰ ĐỘNG CHUYỂN VỀ MÀN HÌNH CHÍNH SAU KHI XEM KẾT QUẢ
function closeSummaryAndReturnHome() {
    document.getElementById('overall-modal').classList.add('hidden');
    backToHome();
}

function saveSessionToHistory() {
    let history = [];
    try {
        history = JSON.parse(localStorage.getItem('jlpt_history') || '[]');
    } catch (e) {
        history = [];
    }

    let totalCorrect = 0;
    let totalQuestions = 0;

    Object.values(currentSession.scores).forEach(s => {
        if (s) {
            totalCorrect += s.correct;
            totalQuestions += s.total;
        }
    });

    if (totalQuestions === 0) return;

    const record = {
        id: Date.now(),
        examId: currentExam.id,
        examName: currentExam.name,
        date: new Date().toLocaleString('vi-VN'),
        totalCorrect: totalCorrect,
        totalQuestions: totalQuestions,
        percent: Math.round((totalCorrect / totalQuestions) * 100),
        scores: { ...currentSession.scores }
    };

    history.unshift(record);
    localStorage.setItem('jlpt_history', JSON.stringify(history));
}

function saveSessionToStorage(examId) {
    localStorage.setItem(`jlpt_session_${examId}`, JSON.stringify(currentSession));
}

function renderHistoryTable() {
    const container = document.getElementById('history-container');
    let history = [];
    try {
        history = JSON.parse(localStorage.getItem('jlpt_history') || '[]');
    } catch (e) {
        history = [];
    }

    if (history.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-500 italic py-4 text-center">Chưa có lịch sử làm bài nào được lưu.</p>';
        return;
    }

    let rowsHTML = history.map(item => `
        <tr class="border-b border-slate-700/60 hover:bg-slate-700/30 text-xs transition">
            <td class="py-3 px-3 text-slate-400 font-mono">${item.date}</td>
            <td class="py-3 px-3 font-bold text-amber-300">${item.examName}</td>
            <td class="py-3 px-3 font-mono font-bold text-emerald-400">${item.totalCorrect}/${item.totalQuestions} (${item.percent}%)</td>
            <td class="py-3 px-3 text-slate-300">
                ${item.scores.moji_goi ? `Moji: ${item.scores.moji_goi.correct}/${item.scores.moji_goi.total}` : '--'} |
                ${item.scores.bunpou ? `Bunpou: ${item.scores.bunpou.correct}/${item.scores.bunpou.total}` : '--'} |
                ${item.scores.choukai ? `Choukai: ${item.scores.choukai.correct}/${item.scores.choukai.total}` : '--'}
            </td>
        </tr>
    `).join('');

    container.innerHTML = `
        <table class="w-full text-left border-collapse">
            <thead>
                <tr class="border-b border-slate-700 text-[11px] text-slate-400 uppercase font-bold">
                    <th class="py-2 px-3">Thời gian</th>
                    <th class="py-2 px-3">Tên Đề Thi</th>
                    <th class="py-2 px-3">Tổng Điểm</th>
                    <th class="py-2 px-3">Chi Tiết Các Phần</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHTML}
            </tbody>
        </table>
    `;
}

function backToHome() {
    stopSectionTimer();
    document.getElementById('exam-view').classList.add('hidden');
    document.getElementById('home-view').classList.remove('hidden');
    renderHistoryTable();
}

// Hàm hỗ trợ định dạng thời gian mm:ss
function formatAudioTime(seconds) {
    if (isNaN(seconds) || seconds <= 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function initEventListeners() {
    // Các sự kiện chuyển trang, nộp bài giữ nguyên...
    document.getElementById('nav-logo').addEventListener('click', backToHome);
    document.getElementById('btn-home-nav').addEventListener('click', backToHome);
    document.getElementById('btn-back-to-home').addEventListener('click', backToHome);

    // =================================================================
    // XỬ LÝ AUDIO CHOUKAI & THANH THỜI GIAN (ẢN/HIỆN & TUA)
    // =================================================================
    const audioProgress = document.getElementById('audio-progress');
    const audioCurrentTime = document.getElementById('audio-current-time');
    const audioDuration = document.getElementById('audio-duration');
    const audioTimelineContainer = document.getElementById('audio-timeline-container');
    const btnToggleTimeline = document.getElementById('btn-toggle-audio-timeline');
    const timelineToggleIcon = document.getElementById('timeline-toggle-icon');
    const timelineToggleText = document.getElementById('timeline-toggle-text');

    // 1. Nút Nút Ẩn/Hiện Thanh Thời Gian
    btnToggleTimeline.addEventListener('click', () => {
        const isHidden = audioTimelineContainer.classList.contains('hidden');
        if (isHidden) {
            audioTimelineContainer.classList.remove('hidden');
            timelineToggleIcon.className = "fa-solid fa-eye";
            timelineToggleText.textContent = "Ẩn thanh thời gian";
        } else {
            audioTimelineContainer.classList.add('hidden');
            timelineToggleIcon.className = "fa-solid fa-eye-slash";
            timelineToggleText.textContent = "Hiện thanh thời gian";
        }
    });

    // 2. Nút Play/Pause Audio
    playAudioBtn.addEventListener('click', () => {
        const icon = document.getElementById('audio-icon');
        const status = document.getElementById('audio-status');

        if (audioPlayer.paused) {
            audioPlayer.play();
            icon.className = "fa-solid fa-pause";
            status.textContent = "Đang phát đĩa nghe...";
        } else {
            audioPlayer.pause();
            icon.className = "fa-solid fa-play";
            status.textContent = "Đã tạm dừng";
        }
    });

    // 3. Nạp tổng thời lượng Audio khi file tải xong
    audioPlayer.addEventListener('loadedmetadata', () => {
        audioDuration.textContent = formatAudioTime(audioPlayer.duration);
        audioProgress.max = Math.floor(audioPlayer.duration);
        audioProgress.value = 0;
        audioCurrentTime.textContent = "00:00";
    });

    // 4. Cập nhật thời gian thực khi Audio đang chạy
    audioPlayer.addEventListener('timeupdate', () => {
        if (!isNaN(audioPlayer.duration)) {
            audioProgress.value = Math.floor(audioPlayer.currentTime);
            audioCurrentTime.textContent = formatAudioTime(audioPlayer.currentTime);
        }
    });

    // 5. Tua file nghe khi kéo thanh trượt (Range input)
    audioProgress.addEventListener('input', () => {
        audioPlayer.currentTime = audioProgress.value;
        audioCurrentTime.textContent = formatAudioTime(audioProgress.value);
    });

    // 6. Khi đĩa nghe phát xong hết bài
    audioPlayer.addEventListener('ended', () => {
        const icon = document.getElementById('audio-icon');
        const status = document.getElementById('audio-status');
        icon.className = "fa-solid fa-play";
        status.textContent = "Đã hoàn thành đĩa nghe";
        audioProgress.value = 0;
        audioCurrentTime.textContent = "00:00";
    });

    // Các sự kiện khác (Nộp bài, Zoom PDF, Clear history...)
    document.getElementById('btn-submit-section').addEventListener('click', () => {
        if (confirm("Bạn có chắc muốn nộp bài phần này?")) {
            gradeCurrentSection();
        }
    });

    document.getElementById('btn-next-section').addEventListener('click', () => {
        if (currentSectionIndex < SECTION_KEYS.length - 1) {
            currentSectionIndex++;
            loadCurrentSection();
        }
    });

    document.getElementById('btn-view-overall-score').addEventListener('click', showOverallScoreModal);
    document.getElementById('btn-close-modal').addEventListener('click', closeSummaryAndReturnHome);

    document.getElementById('btn-zoom-in').addEventListener('click', () => {
        currentPdfScale += 0.15;
        renderPDFPage(currentPdfPage);
    });

    document.getElementById('btn-zoom-out').addEventListener('click', () => {
        if (currentPdfScale > 0.6) {
            currentPdfScale -= 0.15;
            renderPDFPage(currentPdfPage);
        }
    });

    document.getElementById('btn-pdf-prev').addEventListener('click', () => {
        if (currentPdfPage > 1) renderPDFPage(currentPdfPage - 1);
    });

    document.getElementById('btn-pdf-next').addEventListener('click', () => {
        if (masterPdfDoc && currentPdfPage < masterPdfDoc.numPages) renderPDFPage(currentPdfPage + 1);
    });

    document.getElementById('btn-clear-history').addEventListener('click', () => {
        if (confirm("Bạn có chắc muốn xóa toàn bộ lịch sử làm bài?")) {
            localStorage.removeItem('jlpt_history');
            renderHistoryTable();
        }
    });
}