/* Runs inside the sandbox. It receives only this lesson's answers and audio acknowledgements. */
(function(){
const {session,parentOrigin}=window.__lessonBridgeConfig;
let restoring=true, enabled=false, timer=null, sequence=0;
const requests=new Map(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function send(type,payload={}){parent.postMessage({channel:'inglish.lesson.v1',session,type,...payload},parentOrigin);}
window.stopLessonAudio=()=>send('stop-audio');
function lessonFields(w){
  return Array.from(w.document.querySelectorAll('input, textarea, select'))
    .filter(el => !el.closest('.voice-picker'));
}





function lessonSignature(w){
  if(typeof w.lessonStateVersion==='string') {let h=2166136261;for(const c of w.lessonStateVersion)h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0).toString(16);}
  const labels=lessonFields(w).map(el=>{ const parent=el.parentElement.cloneNode(true); parent.querySelectorAll('.fill-fb,.q-fb,.word-count,.fb-line').forEach(n=>n.remove()); return [el.id,el.type,el.dataset.sec,el.dataset.item,el.dataset.part,parent.textContent.trim()]; });
  labels.push(Array.from(w.document.querySelectorAll('.quiz-q p,.tf-text,.mc-opts')).map(el=>el.textContent.trim()));
  let hash=2166136261; for (const c of JSON.stringify(labels)) hash=Math.imul(hash^c.charCodeAt(0),16777619);
  return (hash>>>0).toString(16);
}
/* Домашка: общее состояние с разделом «Домашка» (флаг «в домашке», галочки, тексты заданий). */
let hwMeta={on:0,c:[],t:{}};
function hwChecks(){return Array.from(document.querySelectorAll('.hw-check'));}
function hwTexts(){const t={};for(let i=1;i<=9;i++){const el=document.getElementById('hwText'+i);if(el)t[i]=el;}return t;}
function captureHomework(){
  const checks=hwChecks(), areas=hwTexts();
  const c=checks.length?checks.map(x=>x.checked?1:0):(hwMeta.c||[]);
  const t={...(hwMeta.t||{})};
  for(const [i,el] of Object.entries(areas))t[i]=el.value||'';
  if(!checks.length&&!hwMeta.on&&!c.length&&!Object.keys(t).length)return undefined;
  return {on:hwMeta.on?1:0,c:c.slice(0,10),...(Object.keys(t).length?{t}:{})};
}
function applyHomework(h){
  if(!h)return;
  hwMeta={on:h.on?1:0,c:Array.isArray(h.c)?h.c.slice(0,10):[],t:{...(h.t||{})}};
  const checks=hwChecks();
  (h.c||[]).forEach((v,i)=>{const el=checks[i];if(v===null||v===undefined||!el)return;if(el.checked!==!!v){el.checked=!!v;el.dispatchEvent(new Event('change',{bubbles:true}));}});
  const areas=hwTexts();
  for(const [i,text] of Object.entries(h.t||{})){
    const el=areas[i];
    if(el&&el.value!==text){el.value=text;el.dispatchEvent(new Event('input',{bubbles:true}));}
  }
}
function captureLessonState(){
    const w=window, d=document;
    const data = {
      signature: lessonSignature(w),
      ...(typeof w.lessonStateVersion==='string'?{fieldsById:Object.fromEntries(lessonFields(w).filter(el=>el.id).map(el=>[el.id,(el.type==='checkbox'||el.type==='radio')?{c:el.checked?1:0}:{v:el.value||''}])),lessonState:typeof w.getLessonState==='function'?w.getLessonState():{}}:{}),
      /* всё, что вписано руками */
      fields: lessonFields(w).map(el =>
        (el.type === 'checkbox' || el.type === 'radio') ? { c: el.checked ? 1 : 0 } : { v: el.value || '' }),
      /* нажимала ли «Проверить» */
      fillChecked: !!(d.getElementById('fillFeedback') || {}).textContent,
      readChecked: !!(d.getElementById('readFillFeedback') || {}).textContent,
      /* квиз: какой вариант выбран в каждом вопросе */
      quiz: Array.from(d.querySelectorAll('#quizList .quiz-opts')).map(g => {
        const opts = Array.from(g.querySelectorAll('.quiz-opt'));
        const i = opts.findIndex(o => o.classList.contains('sel-correct') || o.classList.contains('sel-wrong'));
        return i >= 0 ? i : null;
      }),
      /* True / False */
      tf: Array.from(d.querySelectorAll('#tfList .tf-item')).map(row => {
        const btns = Array.from(row.querySelectorAll('.tf-btn'));
        const i = btns.findIndex(b => b.classList.contains('sel-correct') || b.classList.contains('sel-wrong'));
        return i >= 0 ? i : null;
      }),
      tfGroups: Object.fromEntries(['tf1List','tf2List','tf3List','lsList'].map(id=>[id,Array.from(d.querySelectorAll('#'+id+' .tf-item')).map(row=>Array.from(row.querySelectorAll('.tf-btn')).findIndex(b=>b.classList.contains('sel-correct')||b.classList.contains('sel-wrong')))])),
      mc: Array.from(d.querySelectorAll('.mc-opts')).map(g=>Array.from(g.querySelectorAll('.mc-opt')).findIndex(b=>b.classList.contains('picked'))),
      checked: Object.fromEntries([['checkQaBtn','qaFeedback'],['checkTomBtn','tomFeedback'],['submitTestBtn','resultsCard']].map(([button,feedback])=>[button,feedback==='resultsCard'?!!d.getElementById(feedback)?.classList.contains('shown'):!!d.getElementById(feedback)?.textContent])),
      round: typeof w.lessonRound==='function'?w.lessonRound():0,
      roundMatches: typeof w.lessonRoundMatches==='function'?w.lessonRoundMatches():{},
      /* мемо и «Лексика»: найденные пары */
      memo: [...new Set(Array.from(d.querySelectorAll('.memo-card.matched')).map(c => c.dataset.pair))].sort(),
      match: [...new Set(Array.from(d.querySelectorAll('#matchEnCol .match-tile.matched')).map(t => t.dataset.idx))].sort(),
      /* «Готово!» в письменном задании — определяем по «✅» в счётчике слов */
      prodDone: /✅/.test((d.getElementById('wordCount') || {}).textContent || '')
    };
    const hw=captureHomework(); if(hw)data.homework=hw;
    return data;
}

function snapshot(requestId){
 if(!enabled||restoring)return;
 const data=captureLessonState();
 const result=typeof window.lessonResult==='function'?window.lessonResult():{score:parseInt(document.getElementById('scoreDisplay')?.textContent,10)||0,maxScore:0,completed:!!document.getElementById('finalBadge')?.classList.contains('shown')};
 send('snapshot',{data,result,requestId:typeof requestId==='string'?requestId:undefined});
}
window.addEventListener('message',async event=>{
 const msg=event.data;
 if(event.source!==parent||event.origin!==parentOrigin||!msg||msg.channel!=='inglish.lesson.v1'||msg.session!==session)return;
 if(msg.type==='audio-result'){
   const request=requests.get(msg.id);if(!request)return;requests.delete(msg.id);clearTimeout(request.timer);msg.error?request.reject(new Error(msg.error)):request.resolve();return;
 }
 if(msg.type==='capture'){snapshot(msg.requestId);return;}
 if(msg.type==='hw-flag'){hwMeta.on=msg.on?1:0;snapshot();return;}
 if(msg.type==='pause'){enabled=false;return;}
 if(msg.type!=='restore'||enabled)return;
 let data=Array.isArray(msg.data)?{fields:msg.data}:msg.data;
 if(data&&typeof window.migrateLessonState==='function')data=window.migrateLessonState(data);
 try{
  if(data?.signature&&data.signature!==lessonSignature(window)){send('failure',{reason:'lesson-updated'});return;}
  const w=window,d=document;
  if(data){
    /* 1. вписанное руками */
    const els = lessonFields(w);
    (data.fields || []).forEach((f, i) => {
      const el = data.fieldsById ? null : els[i];
      if (!el) return;
      if (f.c !== undefined) {
        if (el.checked !== !!f.c) { el.checked = !!f.c; el.dispatchEvent(new Event('change', { bubbles: true })); }
      } else if (f.v !== undefined && el.value !== f.v) {
        el.value = f.v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    for(const [id,f] of Object.entries(data.fieldsById||{})){
      const el=d.getElementById(id);if(!el||!els.includes(el))continue;
      if(f.c!==undefined){el.checked=!!f.c;el.dispatchEvent(new Event('change',{bubbles:true}));}
      else {el.value=f.v;el.dispatchEvent(new Event('input',{bubbles:true}));}
    }
    /* 2. «переигрываем» клики — урок сам восстановит подсветку, счёт и прогресс */
    (data.quiz || []).forEach((sel, gi) => {
      if (sel === null || sel === undefined) return;
      const g = d.querySelectorAll('#quizList .quiz-opts')[gi];
      const btn = g && g.querySelectorAll('.quiz-opt')[sel];
      if (btn && !g.dataset.done) btn.click();
    });
    (data.tf || []).forEach((sel, ri) => {
      if (sel === null || sel === undefined) return;
      const row = d.querySelectorAll('#tfList .tf-item')[ri];
      const btn = row && row.querySelectorAll('.tf-btn')[sel];
      if (btn && !row.dataset.done) btn.click();
    });
    for (const [id,selections] of Object.entries(data.tfGroups||{})) selections.forEach((sel,i)=>{
      if (sel<0) return; const row=d.querySelectorAll('#'+id+' .tf-item')[i]; row?.querySelectorAll('.tf-btn')[sel]?.click();
    });
    (data.mc||[]).forEach((sel,i)=>{ if(sel>=0) d.querySelectorAll('.mc-opts')[i]?.querySelectorAll('.mc-opt')[sel]?.click(); });
    if (typeof w.restoreRoundMatches==='function') w.restoreRoundMatches(data.roundMatches||{},data.round||0);
    for (const idx of (typeof w.restoreRoundMatches==='function'?[]:data.match || [])) {
      const en = d.querySelector(`#matchEnCol .match-tile[data-idx="${idx}"]:not(.matched)`);
      const ru = d.querySelector(`#matchRuCol .match-tile[data-idx="${idx}"]:not(.matched)`);
      if (en && ru) { en.click(); ru.click(); }
    }
    for (const pair of (data.memo || [])) {
      const cards = d.querySelectorAll(`.memo-card[data-pair="${pair}"]:not(.matched)`);
      if (cards.length === 2) { cards[0].click(); cards[1].click(); await sleep(520); }
    }
    for (const [id,checked] of Object.entries(data.checked||{})) if(checked) d.getElementById(id)?.click();
    if (data.fillChecked) { const b = d.getElementById('checkFillBtn'); b && b.click(); }
    if (data.readChecked) { const b = d.getElementById('checkReadFillBtn'); b && b.click(); }
    if (data.prodDone && !/✅/.test((d.getElementById('wordCount') || {}).textContent || '')) {
      const b = d.getElementById('finishBtn'); b && b.click();
    }

  }
  if(data?.homework)applyHomework(data.homework);
  if(data?.lessonState&&typeof w.restoreLessonState==='function')w.restoreLessonState(data.lessonState);
  restoring=false;enabled=true;document.body.inert=false;snapshot();
 }catch(error){send('failure',{reason:'restore-failed'});}
});
// Shared accessibility and small-screen behavior, applied before the first snapshot.
const style=document.createElement('style');style.textContent=`
:focus-visible{outline:3px solid #BE456F;outline-offset:3px}
.table-scroll{max-width:100%;overflow-x:auto}
@media(max-width:600px){input,textarea,select{font-size:16px!important}button,.match-tile,.memo-card{min-height:44px}.actions-row{flex-wrap:wrap}body{overflow-wrap:anywhere}.table-scroll table{min-width:320px}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
`;document.head.appendChild(style);
for(const table of document.querySelectorAll('table')){const wrap=document.createElement('div');wrap.className='table-scroll';table.replaceWith(wrap);wrap.appendChild(table);}
for(const [i,field]of [...document.querySelectorAll('input,textarea,select')].entries()){
 if(!field.getAttribute('aria-label')&&!field.getAttribute('aria-labelledby')&&!field.labels?.length){field.setAttribute('aria-label',(field.parentElement.textContent.trim().replace(/\s+/g,' ').slice(0,160)||'Ответ')+' — поле '+(i+1));}
}
for(const button of document.querySelectorAll('.play-btn'))if(!button.getAttribute('aria-label'))button.setAttribute('aria-label',(button.classList.contains('slow')?'Озвучить медленно: ':'Озвучить: ')+(button.dataset.text||button.parentElement.textContent.trim()).slice(0,120));
for(const tile of document.querySelectorAll('.match-tile,.memo-card')){tile.setAttribute('role','button');tile.tabIndex=0;}
document.addEventListener('keydown',event=>{const tile=event.target.closest('.match-tile,.memo-card');if(tile&&(event.key==='Enter'||event.key===' ')){event.preventDefault();tile.click();}});
// Vocab rounds recreate tiles, so make new ones keyboard-accessible too.
new MutationObserver(()=>{if(!window.document)return;for(const tile of document.querySelectorAll('.match-tile:not([tabindex]),.memo-card:not([tabindex])')){tile.setAttribute('role','button');tile.tabIndex=0;}}).observe(document.body,{childList:true,subtree:true});
for(const feedback of document.querySelectorAll('[id$="Feedback"],#wordCount'))feedback.setAttribute('aria-live','polite');
for(const picker of document.querySelectorAll('.voice-picker'))picker.replaceChildren(document.createTextNode('Голос настраивается в кабинете. Если серверная озвучка недоступна, используется голос устройства.'));

const originalSpeak=window.speak;
if(typeof originalSpeak==='function')window.speak=(text,rate,button)=>{
 const id=++sequence;button?.classList.add('playing');
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{requests.delete(id);reject(new Error('Озвучка не ответила'));},240000);
  requests.set(id,{resolve,reject,timer});send('speak',{id,text:String(text),rate:typeof rate==='number'?rate:1});
 }).then(()=>true).catch(()=>false).finally(()=>button?.classList.remove('playing'));
};
for(const type of ['input','change','click'])document.addEventListener(type,()=>{clearTimeout(timer);timer=setTimeout(snapshot,350);},true);
window.addEventListener('pagehide',snapshot);
setInterval(snapshot,5000);
document.body.inert=true;
send('ready');
})();
