/* ============================================================
   Общее для всех страниц: конфиг репозитория, загрузка курса,
   настройки (ключ Groq, токен GitHub).
   Курс хранится в course.json — редактируется страницей
   «Добавить урок» или руками.
   ============================================================ */

const REPO = { owner: "grindasha206-hue", name: "inglish", branch: "main" };

let COURSE = null;
let ALL_LESSONS = [];

async function loadCourse(){
  const res = await fetch("course.json?ts=" + Date.now());
  COURSE = await res.json();
  ALL_LESSONS = COURSE.levels.flatMap(lv => lv.modules.flatMap(m => m.lessons));
  return COURSE;
}

function lessonById(id){ return ALL_LESSONS.find(l => l.id === id) || null; }
function lessonAfter(id){
  const i = ALL_LESSONS.findIndex(l => l.id === id);
  return (i >= 0 && i < ALL_LESSONS.length - 1) ? ALL_LESSONS[i + 1] : null;
}
/* Уровень и модуль, в которых лежит урок */
function lessonHome(id){
  for (const lv of COURSE.levels)
    for (const m of lv.modules)
      if (m.lessons.some(l => l.id === id)) return { level: lv, module: m };
  return null;
}

/* ---- настройки (хранятся только в этом браузере) ---- */
const SET_PREFIX = "english.setting.";
function getSetting(key){ try { return localStorage.getItem(SET_PREFIX + key) || ""; } catch(e){ return ""; } }
function setSetting(key, val){
  try { val ? localStorage.setItem(SET_PREFIX + key, val) : localStorage.removeItem(SET_PREFIX + key); } catch(e){}
}

/* ---- Groq TTS (Orpheus) ---- */
const GROQ_VOICES = ["autumn", "diana", "hannah", "austin", "daniel", "troy"];
const _ttsCache = new Map();
let _ttsAudio = null;

async function groqSpeak(text, rate){
  const key = getSetting("groqKey");
  if (!key) throw new Error("no-key");
  const voice = getSetting("groqVoice") || "hannah";
  /* Точка в конце помогает модели не «фантазировать» продолжение коротких фраз */
  let input = String(text).trim().slice(0, 190);
  if (!/[.!?…]$/.test(input)) input += ".";
  const cacheId = voice + "|" + input;
  let url = _ttsCache.get(cacheId);
  if (!url) {
    const r = await fetch("https://api.groq.com/openai/v1/audio/speech", {
      method: "POST",
      headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "canopylabs/orpheus-v1-english",
        input: input,
        voice: voice,
        response_format: "wav"
      })
    });
    if (!r.ok) {
      let msg = "groq-" + r.status;
      try { const j = await r.json(); if (j.error && j.error.message) msg = j.error.message; } catch(e){}
      throw new Error(msg);
    }
    url = URL.createObjectURL(await r.blob());
    _ttsCache.set(cacheId, url);
  }
  if (_ttsAudio) { _ttsAudio.pause(); _ttsAudio = null; }
  const audio = new Audio(url);
  _ttsAudio = audio;
  /* Замедляем только настоящие кнопки 🐢 (rate ≤ 0.6). Голос Groq и так
     естественный, поэтому «слегка замедленные» кнопки урока (0.85) играют как 1x. */
  audio.playbackRate = (rate && rate <= 0.6) ? 0.72 : 1;
  await audio.play();
  return new Promise(resolve => { audio.onended = resolve; audio.onpause = resolve; });
}
