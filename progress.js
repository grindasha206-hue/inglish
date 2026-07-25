/* ============================================================
   ПРОГРЕСС — хранение в localStorage браузера.
   Структура:
   {
     lessons: { "unit-01": { status:"done"|"started", bestScore, maxScore, completedAt } },
     xp: 120,
     activity: { "2026-07-25": true, ... }   // дни, когда занималась
   }
   ============================================================ */

const STORE_KEY = "english.progress.v1";
const XP_PER_LESSON = 50; // базовые очки за пройденный урок (+ звёзды из урока)

function loadProgress(){
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { lessons: p.lessons || {}, xp: p.xp || 0, activity: p.activity || {} };
    }
  } catch(e){ /* повреждённые данные — начинаем заново */ }
  return { lessons: {}, xp: 0, activity: {} };
}

function saveProgress(p){
  try { localStorage.setItem(STORE_KEY, JSON.stringify(p)); } catch(e){}
}

/* ---- даты ---- */
function todayKey(d){
  const dt = d || new Date();
  const y = dt.getFullYear(), m = String(dt.getMonth()+1).padStart(2,"0"), day = String(dt.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

/* Отметить: сегодня занималась */
function touchActivity(p){
  const k = todayKey();
  if (!p.activity[k]) { p.activity[k] = true; saveProgress(p); }
}

/* Серия дней подряд (streak). Считается не сгоревшей, пока не кончился сегодняшний день. */
function currentStreak(p){
  let streak = 0;
  const d = new Date();
  if (!p.activity[todayKey(d)]) d.setDate(d.getDate() - 1); // сегодня ещё не занималась — считаем от вчера
  while (p.activity[todayKey(d)]) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

/* ---- уроки ---- */
function lessonState(p, id){ return p.lessons[id] || null; }

function markStarted(p, id){
  if (!p.lessons[id]) { p.lessons[id] = { status: "started" }; saveProgress(p); }
  touchActivity(p);
}

/* Завершение урока. Возвращает количество начисленных XP (0, если уже был пройден). */
function markCompleted(p, id, score, maxScore){
  const prev = p.lessons[id] || {};
  const first = prev.status !== "done";
  p.lessons[id] = {
    status: "done",
    bestScore: Math.max(prev.bestScore || 0, score || 0),
    maxScore: maxScore || prev.maxScore || 0,
    completedAt: prev.completedAt || new Date().toISOString()
  };
  let gained = 0;
  if (first) { gained = XP_PER_LESSON + (score || 0); p.xp += gained; }
  saveProgress(p);
  touchActivity(p);
  return gained;
}

/* ---- уровень из XP ---- */
function levelInfo(xp){
  const level = Math.floor(xp / 100) + 1;
  const into = xp % 100;
  return { level, into, need: 100, pct: Math.round(into) };
}

/* Следующий непройденный урок (для кнопки «Продолжить») */
function nextLesson(p){
  return ALL_LESSONS.find(l => !(p.lessons[l.id] && p.lessons[l.id].status === "done")) || null;
}

/* ---- экспорт / импорт (страховка от потери данных) ---- */
function exportProgress(){
  const blob = new Blob([localStorage.getItem(STORE_KEY) || "{}"], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "english-progress-" + todayKey() + ".json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function importProgress(file, onDone){
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const p = JSON.parse(reader.result);
      if (typeof p === "object" && p !== null) {
        localStorage.setItem(STORE_KEY, JSON.stringify({ lessons: p.lessons||{}, xp: p.xp||0, activity: p.activity||{} }));
        onDone && onDone(true);
        return;
      }
    } catch(e){}
    onDone && onDone(false);
  };
  reader.readAsText(file);
}
