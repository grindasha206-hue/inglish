/* Account-scoped, monotonic progress. Cloud writes merge in a transaction. */
const XP_PER_LESSON = 50;
function progressKey(){ return accountKey('progress.v2'); }
function loadProgress(){
  try { const raw = localStorage.getItem(progressKey()); if (raw) return SyncCore.validateProgress(JSON.parse(raw)); }
  catch(e){
    const raw=localStorage.getItem(progressKey());
    if(raw) localStorage.setItem(accountKey('corrupt-progress.'+Date.now()),raw);
    setSyncStatus('error', 'Локальный прогресс повреждён. Исходная копия сохранена отдельно.');
  }
  return SyncCore.emptyProgress();
}
function storeProgress(p, uid = cloudUserId()){
  const clean = SyncCore.validateProgress(p);
  try { localStorage.setItem(accountKey('progress.v2',uid), JSON.stringify(clean)); }
  catch(e){ setSyncStatus('error', 'Не удалось сохранить данные в браузере. Не закрывай страницу.'); throw e; }
  return clean;
}
function saveProgress(p){
  const merged=SyncCore.mergeProgress(loadProgress(),p);
  merged.updatedAt=Date.now(); Object.assign(p,merged); storeProgress(merged);
  queueProgressSync(merged);
}
async function mergeCloudIntoLocal(){
  const uid=cloudUserId(); if (!uid) return SyncCore.emptyProgress();
  try {
    const cloud=await cloudLoadProgress(uid);
    if (uid!==cloudUserId()) return SyncCore.emptyProgress();
    const merged=SyncCore.mergeProgress(loadProgress(),cloud||SyncCore.emptyProgress());
    storeProgress(merged,uid);
    if (!cloud || !SyncCore.equal(merged,cloud)) queueProgressSync(merged);
    return merged;
  } catch(e){ setSyncStatus('error','Облако недоступно. Ответы сохраняются в этом браузере.'); return loadProgress(); }
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

/* Completion is monotonic; XP is awarded once per lesson. */
function lessonState(p,id){ return p.lessons[id] || null; }
function markStarted(p,id){
  Object.assign(p,SyncCore.mergeProgress(loadProgress(),p));
  if (!p.lessons[id]) p.lessons[id]={status:'started'};
  p.activity[todayKey()]=true; saveProgress(p);
}
function markCompleted(p,id,score,maxScore){
  Object.assign(p,SyncCore.mergeProgress(loadProgress(),p));
  const prev=p.lessons[id]||{}, first=prev.status!=='done';
  score=Number.isSafeInteger(score)&&score>=0?score:0;
  maxScore=Number.isSafeInteger(maxScore)&&maxScore>=0?maxScore:0;
  if (maxScore) score=Math.min(score,maxScore);
  const gained=first?XP_PER_LESSON+score:0;
  p.lessons[id]={status:'done',bestScore:Math.max(prev.bestScore||0,score),maxScore:Math.max(prev.maxScore||0,maxScore),
    completedAt:prev.completedAt||new Date().toISOString(),awardedXP:first?gained:prev.awardedXP};
  p.activity[todayKey()]=true; saveProgress(p); return gained;
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

/* Import adds valid results; it never silently deletes newer work. */
function exportProgress(){ downloadJSON(loadProgress(),'english-progress-'+todayKey()+'.json'); }
function importProgress(file,onDone){
  if (file.size>2*1024*1024) { onDone?.(false); return; }
  const reader=new FileReader();
  reader.onerror=()=>onDone?.(false);
  reader.onload=()=>{ try {
    const imported=SyncCore.validateProgress(JSON.parse(reader.result));
    const merged=SyncCore.mergeProgress(loadProgress(),imported); saveProgress(merged); onDone?.(true);
  } catch(e){ onDone?.(false); } };
  reader.readAsText(file);
}
