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

/* Account-specific storage. Unowned legacy data is claimed only after confirmation. */
function accountKey(name,uid=cloudUserId()) { return 'english.user.'+(uid||'signed-out')+'.'+name; }
function getSetting(key){ try { return localStorage.getItem(accountKey('setting.'+key))||''; } catch(e){ return ''; } }
function setSetting(key,val){
  try { const k=accountKey('setting.'+key); val?localStorage.setItem(k,val):localStorage.removeItem(k); }
  catch(e){ setSyncStatus('error','Не удалось сохранить настройки в браузере.'); }
}
function downloadJSON(data,name){
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function initializeAccountStorage(){
  const uid=cloudUserId(); if (!uid) return;
  purgeBrowserSecrets();
  const marker=accountKey('migration.v2');
  if (localStorage.getItem(marker)) return;
  const keys=Object.keys(localStorage).filter(k=>k==='english.progress.v1'||k.startsWith('english.lessonState.')||k.startsWith('english.setting.'));
  if (keys.length && confirm('В браузере найдены данные старой версии без привязки к аккаунту.\nПеренести их в аккаунт '+currentUser.email+'?\nПодтверди только если это твои ответы и ключи.')) {
    const backup=Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)]));
    localStorage.setItem(accountKey('legacy-backup'),JSON.stringify(backup));
    for (const key of keys) {
      const value=localStorage.getItem(key);
      if (key==='english.progress.v1') {
        try { const old=SyncCore.validateProgress(JSON.parse(value));
          const raw=localStorage.getItem(accountKey('progress.v2'));
          localStorage.setItem(accountKey('progress.v2'),JSON.stringify(SyncCore.mergeProgress(old,raw?JSON.parse(raw):SyncCore.emptyProgress())));
        } catch(e){ setSyncStatus('error','Старый прогресс повреждён. Его копия сохранена для восстановления.'); }
      } else if (key.startsWith('english.lessonState.')) {
        const target=accountKey('lessonState.'+key.slice('english.lessonState.'.length));
        if (!localStorage.getItem(target)) localStorage.setItem(target,value);
      } else {
        const target=accountKey('setting.'+key.slice('english.setting.'.length));
        if (!localStorage.getItem(target)) localStorage.setItem(target,value);
      }
    }
    keys.forEach(k=>localStorage.removeItem(k));
  }
  localStorage.setItem(marker,'1');
}
let syncState={kind:'saved',message:'Данные в этом браузере'};
const syncJobs=new Map();
function setSyncStatus(kind,message){
  if (kind==='conflict') window.answerConflictMessage=message;
  if (kind==='saved' && window.answerConflictMessage) { kind='conflict'; message=window.answerConflictMessage; }
  syncState={kind,message};
  let el=document.getElementById('syncStatus');
  if (!el && document.body) {
    el=document.createElement('div'); el.id='syncStatus'; el.setAttribute('role','status'); el.setAttribute('aria-live','polite');
    el.style.cssText='font:12px Manrope,sans-serif;padding:4px 14px;background:#fffaf0;color:#5c554c;flex-shrink:0';
    document.body.appendChild(el);
  }
  if (el) { const button=el.querySelector('button'); el.textContent=message; if (button) el.appendChild(button); }
}
function queueSync(id,task){
  syncJobs.set(id,task); setSyncStatus('pending','Есть изменения для отправки в облако…'); flushSync();
}
let flushing=false, retryTimer=null;
async function flushSync(){
  if (flushing || !cloudUserId()) return;
  flushing=true; clearTimeout(retryTimer); retryTimer=null;
  try {
    for (const [id,task] of syncJobs) {
      await task(); if (syncJobs.get(id)===task) syncJobs.delete(id);
    }
    if (!syncJobs.size) setSyncStatus('saved','✓ Изменения сохранены в облаке');
  } catch(e){
    console.warn('Синхронизация отложена:',e);
    setSyncStatus('error','Облако недоступно. Изменения сохранены в браузере; повторим отправку.');
    retryTimer=setTimeout(flushSync,15000);
  } finally { flushing=false; if(syncJobs.size && !retryTimer) setTimeout(flushSync,0); }
}
window.addEventListener('online',flushSync);
window.addEventListener('pagehide',()=>{ /* Pending copies are persisted before network calls. */ });
function queueProgressSync(p){
  const uid=cloudUserId(); if (!uid) return;
  localStorage.setItem(accountKey('pendingProgress',uid),'1');
  queueSync(uid+':progress',async()=>{
    if (uid!==cloudUserId()) throw new Error('account-changed');
    const sent=loadProgress(); const merged=await cloudSaveProgress(sent,uid);
    if (uid!==cloudUserId()) return;
    const current=loadProgress(); const latest=SyncCore.mergeProgress(current,merged); storeProgress(latest,uid);
    if (SyncCore.equal(sent,current)) localStorage.removeItem(accountKey('pendingProgress',uid));
    else queueProgressSync(latest);
  });
}
function resumePendingSync(){
  const uid=cloudUserId(); if (!uid) return;
  if (localStorage.getItem(accountKey('pendingProgress',uid))) queueProgressSync(loadProgress());
  const prefix=accountKey('lessonState.',uid);
  Object.keys(localStorage).filter(k=>k.startsWith(prefix)).forEach(k=>{
    try { const env=JSON.parse(localStorage.getItem(k)); if (env?.pending) queueLessonSync(k.slice(prefix.length),env,uid); } catch(e){}
  });
}
/* ---- Groq TTS (Orpheus) ---- */
const GROQ_VOICES = ["autumn", "diana", "hannah", "austin", "daniel", "troy"];
const groqTts=TTS.engine({name:'Groq',enabled:()=>serverCapabilities.groq,voice:'groqVoice',defaultVoice:'hannah',model:'canopylabs/orpheus-v1-english',settings:{delivery:'professional-v1'},cache:'inglish-tts-v3',limit:170,punctuation:true,
 transport:(input,voice,signal)=>gatewayResponse('/tts',{provider:'groq',text:input,voice},signal)});
const elevenTts=TTS.engine({name:'ElevenLabs',enabled:()=>serverCapabilities.eleven,voice:'elevenVoice',model:'eleven_multilingual_v2',settings:{stability:0.6,similarity_boost:0.75},cache:'inglish-tts-11labs-v2',limit:500,
 transport:(text,voice,signal)=>gatewayResponse('/tts',{provider:'eleven',text,voice},signal)});
function groqSpeak(text,rate){return groqTts.speak(text,rate);}
function elevenSpeak(text,rate){return elevenTts.speak(text,rate);}
function regenerateLastTts(){return groqTts.regenerate();}
function regenerateLastEleven(){return elevenTts.regenerate();}
window.addEventListener('pagehide',()=>TTS.stop());

/* ============================================================
   ОБЛАЧНАЯ СИНХРОНИЗАЦИЯ (Firebase Firestore)
   localStorage остаётся быстрым локальным кэшем — Firestore
   становится страховкой на случай сброса кэша/данных сайта.
   Доступ к документам ограничивается правилами Firestore по UID.
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
      const previous=currentUser;
      currentUser = user;
      if (previous && previous.uid!==user?.uid) location.reload();
      if (_authStateResolve) { _authStateResolve(user); _authStateResolve = null; }
    });
    return true;
  } catch(e){
    console.warn("Облако недоступно, работаем только с localStorage:", e);
    if (_authStateResolve) { _authStateResolve(null); _authStateResolve = null; }
    return false;
  }
})();

/* Accounts are created manually; invitation policy is enforced by Firestore Rules. */
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
  currentUser = null; syncJobs.clear(); clearTimeout(retryTimer); retryTimer=null;
}

function cloudUserId(){ return currentUser ? currentUser.uid : null; }

/* Transactions preserve independent results from other devices. */
async function requireCloud(uid){
  if (!await _cloudReady || !uid || uid!==cloudUserId()) throw new Error('cloud-unavailable');
}
async function cloudSaveProgress(p,uid=cloudUserId()){
  await requireCloud(uid);
  const ref=_cloudDocFns.doc(_cloudDb,'inglishProgress',uid);
  return _cloudDocFns.runTransaction(_cloudDb,async tx=>{
    const snap=await tx.get(ref);
    const merged=SyncCore.mergeProgress(snap.exists()?snap.data():SyncCore.emptyProgress(),p);
    tx.set(ref,{...merged,updatedAt:Date.now()}); return merged;
  });
}
async function cloudLoadProgress(uid=cloudUserId()){
  await requireCloud(uid);
  const snap=await _cloudDocFns.getDoc(_cloudDocFns.doc(_cloudDb,'inglishProgress',uid));
  return snap.exists()?SyncCore.validateProgress(snap.data()):null;
}
function lessonStorageKey(id,uid=cloudUserId()){ return accountKey('lessonState.'+id,uid); }
function lessonEnvelope(raw){
  if (!raw) return {schemaVersion:2,epoch:'legacy',revision:0,data:null,base:null,pending:false};
  if (raw.schemaVersion===2 && typeof raw.epoch==='string') return raw;
  const legacy=raw.data && raw.updatedAt!==undefined?raw.data:raw;
  return {schemaVersion:2,epoch:'legacy',revision:0,data:Array.isArray(legacy)?{fields:legacy}:legacy,base:null,pending:false};
}
function localLessonEnvelope(id,uid=cloudUserId()){
  try { return lessonEnvelope(JSON.parse(localStorage.getItem(lessonStorageKey(id,uid))||'null')); }
  catch(e){ throw new Error('Не удалось прочитать ответы урока. Старая копия не удалена.'); }
}
function keepConflict(id,env,paths,uid){
  const key=accountKey('conflict.'+id+'.'+crypto.randomUUID(),uid);
  localStorage.setItem(key,JSON.stringify({savedAt:new Date().toISOString(),lessonId:id,paths,data:env.data}));
  setSyncStatus('conflict','Ответы на двух устройствах различаются. Локальная копия сохранена отдельно.');
  let button=document.getElementById('downloadConflict');
  if (!button) { button=document.createElement('button'); button.id='downloadConflict'; button.textContent='Скачать копию ответов'; document.getElementById('syncStatus')?.appendChild(button); }
  button.onclick=()=>downloadJSON(Object.keys(localStorage).filter(k=>k.startsWith(accountKey('conflict.',uid))).map(k=>JSON.parse(localStorage.getItem(k))),'english-conflicting-answers.json');
}
function queueLessonSync(id,env,uid=cloudUserId()){
  queueSync(uid+':lesson:'+id,async()=>{
    await requireCloud(uid);
    const key=lessonStorageKey(id,uid), sent=localLessonEnvelope(id,uid);
    if (!sent.pending) return;
    const ref=_cloudDocFns.doc(_cloudDb,'inglishLessonState',uid+'__'+id);
    const result=await _cloudDocFns.runTransaction(_cloudDb,async tx=>{
      const snap=await tx.get(ref), remote=lessonEnvelope(snap.exists()?snap.data():null);
      // A reset is a new generation. Old offline edits cannot resurrect it.
      if (!sent.reset && sent.epoch!==remote.epoch) return {env:remote,conflicts:['reset']};
      let merged={data:sent.data,conflicts:[]};
      if (!sent.reset && remote.data!==null) merged=SyncCore.mergeAnswers(sent.base,sent.data,remote.data);
      const next={schemaVersion:2,epoch:sent.reset?sent.epoch:remote.epoch,revision:(remote.revision||0)+1,data:merged.data||{},updatedAt:Date.now()};
      tx.set(ref,next); return {env:next,conflicts:merged.conflicts};
    });
    if (uid!==cloudUserId()) return;
    const current=localLessonEnvelope(id,uid);
    if (result.conflicts.length) keepConflict(id,sent,result.conflicts,uid);
    // Rebase edits made while the transaction was in flight; never replace them.
    if (!SyncCore.equal(current,sent)) {
      if (current.epoch!==sent.epoch) { queueLessonSync(id,current,uid); return; }
      const rebased=SyncCore.mergeAnswers(sent.data,current.data,result.env.data);
      if (rebased.conflicts.length) keepConflict(id,current,rebased.conflicts,uid);
      const next={...result.env,data:rebased.data,base:result.env.data,pending:true};
      localStorage.setItem(key,JSON.stringify(next)); queueLessonSync(id,next,uid);
    } else localStorage.setItem(key,JSON.stringify({...result.env,base:result.env.data,pending:false}));
  });
}
function persistLessonState(id,data,expectedEpoch,previousCapture){
  const uid=cloudUserId(); if (!uid) return;
  const old=localLessonEnvelope(id,uid);
  if (expectedEpoch!==undefined && expectedEpoch!==old.epoch) throw new Error('Урок сброшен на другом устройстве. Перезагрузи страницу, чтобы продолжить.');
  if (previousCapture!==undefined && old.data && Object.keys(old.data).length) {
    const merged=SyncCore.mergeAnswers(previousCapture,data,old.data);
    if (merged.conflicts.length) keepConflict(id,{data},merged.conflicts,uid);
    data=merged.data;
  }
  if (SyncCore.equal(old.data,data)) return;
  const next={...old,data,base:old.pending?old.base:(old.data??previousCapture??null),pending:true};
  localStorage.setItem(lessonStorageKey(id,uid),JSON.stringify(next)); queueLessonSync(id,next,uid);
}
function resetLessonState(id){
  const next={schemaVersion:2,epoch:crypto.randomUUID(),revision:0,data:{},base:null,pending:true,reset:true};
  localStorage.setItem(lessonStorageKey(id),JSON.stringify(next)); queueLessonSync(id,next); return next;
}
async function cloudLoadLessonState(id){
  const uid=cloudUserId(); await requireCloud(uid);
  const snap=await _cloudDocFns.getDoc(_cloudDocFns.doc(_cloudDb,'inglishLessonState',uid+'__'+id));
  if (uid!==cloudUserId()) throw new Error('account-changed');
  const remote=lessonEnvelope(snap.exists()?snap.data():null), local=localLessonEnvelope(id,uid);
  if (local.pending) { queueLessonSync(id,local,uid); return local.data; }
  // Legacy local copies were never versioned: preserve a copy before preferring cloud.
  if (local.data && remote.data && local.revision===0 && !SyncCore.equal(local.data,remote.data)) keepConflict(id,local,['legacy'],uid);
  const chosen=remote.data!==null?remote:local;
  localStorage.setItem(lessonStorageKey(id,uid),JSON.stringify({...chosen,base:chosen.data,pending:false}));
  if (!remote.data && local.data) { persistLessonState(id,local.data); const e=localLessonEnvelope(id); e.pending=true; localStorage.setItem(lessonStorageKey(id),JSON.stringify(e)); queueLessonSync(id,e); }
  return chosen.data;
}
