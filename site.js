/* ============================================================
   Общее для всех страниц: конфиг репозитория, загрузка курса,
   настройки (ключ Groq, токен GitHub), облачная синхронизация.
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

/* ============================================================
   ОБЛАЧНАЯ СИНХРОНИЗАЦИЯ (Firebase Firestore)
   localStorage остаётся быстрым локальным кэшем — Firestore
   становится страховкой на случай сброса кэша/данных сайта.
   Личный ключ "зашит" в код, не в браузер — переживает
   очистку кэша и работает на любом устройстве, где открыт сайт.
   ============================================================ */
let _cloudDb = null;
let _cloudDocFns = null;
let _cloudAuth = null;
let _authFns = null;
let currentUser = null;
let _authStateResolve;
const authReady = new Promise(res => { _authStateResolve = res; }); /* резолвится один раз: null (не вошёл) или объект пользователя */

let _cloudReady = (async () => {
  try {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js");
    const firestoreMod = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
    const authMod = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js");
    const firebaseConfig = {
      apiKey: "AIzaSyBXdyJhFcHTdgWbcvuvRdTho8Gal2FCAOc",
      authDomain: "inglish-progress.firebaseapp.com",
      projectId: "inglish-progress",
      storageBucket: "inglish-progress.firebasestorage.app",
      messagingSenderId: "71414843435",
      appId: "1:71414843435:web:dbdf466da49bda2ea4426e"
    };
    const app = initializeApp(firebaseConfig);
    _cloudDb = firestoreMod.getFirestore(app);
    _cloudDocFns = firestoreMod;
    _cloudAuth = authMod.getAuth(app);
    _authFns = authMod;
    authMod.onAuthStateChanged(_cloudAuth, (user) => {
      currentUser = user;
      if (_authStateResolve) { _authStateResolve(user); _authStateResolve = null; }
    });
    return true;
  } catch(e){
    console.warn("Облако недоступно, работаем только с localStorage:", e);
    if (_authStateResolve) { _authStateResolve(null); _authStateResolve = null; }
    return false;
  }
})();

/* ---- вход / выход. Регистрация с сайта закрыта — аккаунты создаются
   только в Firebase Console (Authentication → Users → Add user). ---- */
async function signIn(email, password){
  const ok = await _cloudReady;
  if (!ok || !_cloudAuth) throw new Error("cloud-unavailable");
  const cred = await _authFns.signInWithEmailAndPassword(_cloudAuth, email, password);
  currentUser = cred.user;
  return cred.user;
}

async function signOutUser(){
  const ok = await _cloudReady;
  if (ok && _cloudAuth) await _authFns.signOut(_cloudAuth);
  currentUser = null;
}

function cloudUserId(){ return currentUser ? currentUser.uid : null; }

/* Общий прогресс (XP, streak, статус уроков) — один документ на пользователя, ключ = uid */
async function cloudSaveProgress(p){
  const ok = await _cloudReady;
  const uid = cloudUserId();
  if (!ok || !uid) return;
  try {
    const ref = _cloudDocFns.doc(_cloudDb, "inglishProgress", uid);
    await _cloudDocFns.setDoc(ref, { ...p, updatedAt: Date.now() });
  } catch(e){ console.warn("Не удалось сохранить прогресс в облако:", e); }
}

async function cloudLoadProgress(){
  const ok = await _cloudReady;
  const uid = cloudUserId();
  if (!ok || !uid) return null;
  try {
    const ref = _cloudDocFns.doc(_cloudDb, "inglishProgress", uid);
    const snap = await _cloudDocFns.getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data();
    return { lessons: data.lessons || {}, xp: data.xp || 0, activity: data.activity || {}, updatedAt: data.updatedAt || 0 };
  } catch(e){ console.warn("Не удалось загрузить прогресс из облака:", e); return null; }
}

/* Детальное состояние конкретного урока (вписанные ответы, квиз, игры), ключ = uid + id урока */
async function cloudSaveLessonState(lessonId, data){
  const ok = await _cloudReady;
  const uid = cloudUserId();
  if (!ok || !uid) return;
  try {
    const ref = _cloudDocFns.doc(_cloudDb, "inglishLessonState", `${uid}__${lessonId}`);
    await _cloudDocFns.setDoc(ref, { data, updatedAt: Date.now() });
  } catch(e){ console.warn("Не удалось сохранить состояние урока в облако:", e); }
}

async function cloudLoadLessonState(lessonId){
  const ok = await _cloudReady;
  const uid = cloudUserId();
  if (!ok || !uid) return null;
  try {
    const ref = _cloudDocFns.doc(_cloudDb, "inglishLessonState", `${uid}__${lessonId}`);
    const snap = await _cloudDocFns.getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data().data || null;
  } catch(e){ console.warn("Не удалось загрузить состояние урока из облака:", e); return null; }
}
