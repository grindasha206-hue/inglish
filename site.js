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
let _ttsQueue = Promise.resolve(); /* запросы к Groq идут строго по одному */
let _lastTts = null; /* последняя озвученная фраза — для кнопки «перегенерировать» */
const _sleep = ms => new Promise(res => setTimeout(res, ms));

async function _fetchTts(input, voice, key){
  /* 1) постоянный кэш браузера — уже озвученные фразы не запрашиваются повторно */
  const cacheKey = "/tts-cache/v1/" + voice + "/" + encodeURIComponent(input);
  let store = null;
  try { store = await caches.open("inglish-tts"); } catch(e){}
  if (store) {
    try { const hit = await store.match(cacheKey); if (hit) return await hit.blob(); } catch(e){}
  }
  /* 2) запрос с повторами: лимит запросов в минуту (429) — ждём и пробуем снова */
  for (let attempt = 0; ; attempt++) {
    const r = await fetch("https://api.groq.com/openai/v1/audio/speech", {
      method: "POST",
      headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "canopylabs/orpheus-v1-english", input, voice, response_format: "wav" })
    });
    if (r.status === 429 && attempt < 3) { await _sleep(1800 * (attempt + 1)); continue; }
    if (!r.ok) {
      let msg = "groq-" + r.status;
      try { const j = await r.json(); if (j.error && j.error.message) msg = j.error.message; } catch(e){}
      throw new Error(msg);
    }
    const blob = await r.blob();
    if (store) { try { await store.put(cacheKey, new Response(blob, { headers: { "Content-Type": "audio/wav" } })); } catch(e){} }
    return blob;
  }
}

async function groqSpeak(text, rate){
  const key = getSetting("groqKey");
  if (!key) throw new Error("no-key");
  const voice = getSetting("groqVoice") || "hannah";
  /* Точка в конце помогает модели не «фантазировать» продолжение коротких фраз */
  let input = String(text).trim().slice(0, 190);
  if (!/[.!?…]$/.test(input)) input += ".";
  const cacheId = voice + "|" + input;
  _lastTts = { input, voice, cacheId, rate };
  let url = _ttsCache.get(cacheId);
  if (!url) {
    const task = _ttsQueue.catch(() => {}).then(() => _fetchTts(input, voice, key));
    _ttsQueue = task;
    const blob = await task;
    url = _ttsCache.get(cacheId) || URL.createObjectURL(blob);
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

/* Модель сгенерировала фразу криво? Выбрасываем её из кэша и просим заново. */
async function regenerateLastTts(){
  if (!_lastTts) return false;
  const { input, voice, cacheId, rate } = _lastTts;
  _ttsCache.delete(cacheId);
  try {
    const store = await caches.open("inglish-tts");
    await store.delete("/tts-cache/v1/" + voice + "/" + encodeURIComponent(input));
  } catch(e){}
  await groqSpeak(input, rate);
  return true;
}
