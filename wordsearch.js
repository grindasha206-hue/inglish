(async function(){
'use strict';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const catalog=window.WORDSEARCH_CATALOG,core=window.WordSearch,colors=['#f7c9d8','#cde4d7','#f5dfb2','#cfdff5','#e3d2f0','#bfe3e1','#f5cfba','#e0e6b8','#d7d3f4','#f0d3e6'];
let app={hist:{}},source='catalog',mode='en',currentId=null,puzzle=null,anchor=null,pointer=null,dragStart=null,lastCell=null,moved=false,pencil=false,ready=false,pulling=false;
function game(){return app.hist[currentId];}
function definition(id){return catalog.find(d=>d.id===id);}
function gamesFor(def,m=mode){return Object.entries(app.hist).filter(([,g])=>g.definitionId===def.id&&g.mode===m).sort((a,b)=>(b[1].created-a[1].created)||b[0].localeCompare(a[0]));}
const foundCount=g=>g?.words.filter(w=>g.found?.[w.en.toUpperCase()]===true).length||0;
const state=g=>!g?'new':foundCount(g)===g.words.length?'done':'playing';
function commit(edit){
 const next=JSON.parse(JSON.stringify(AppStore.peek('wordsearch')));next.hist||={};edit(next);
 if(JSON.stringify(next).length>400000)throw Error('История филвордов заполнена. Сохранённые игры не удалены.');
 if(!AppStore.save('wordsearch',next))throw Error('Не удалось сохранить игру. Проверь свободное место на устройстве.');
 app=AppStore.peek('wordsearch');app.hist||={};
}
function showError(error){$('feedback').textContent=error.message||String(error);}
function create(def,m,newRound=false){
 const fingerprint=core.hash(JSON.stringify(def.words)),id=def.id+'-'+m+'-'+fingerprint+(newRound?'-'+crypto.randomUUID():'-first');
 if(!app.hist[id]){
  const generated=core.generate(def.words.map(w=>w.en),id);
  const record={definitionId:def.id,title:def.title,en:def.en,mode:m,created:newRound?Date.now():0,words:def.words,rows:generated.rows,found:{},hints:{}};
  commit(next=>{next.hist[id]=record;});
 }
 return id;
}
function hydrate(g){const words=g.words.map(w=>w.en.toUpperCase()),p={version:1,size:g.rows.length,rows:g.rows,placements:words.map(word=>{const hits=core.occurrences(g.rows,word);if(hits.length!==1)throw Error('Сохранённая сетка повреждена. Её копия не удалена.');return hits[0];})};core.validate(p,words);return p;}
function renderCatalog(){
 $('learnedWrap').hidden=source!=='course';$('search').placeholder=source==='course'?'Название урока…':'Семья, еда, путешествия…';
 $('catalogNote').textContent=source==='catalog'?'Все темы доступны сразу. Незаконченные филворды — в начале списка.':'Слова взяты из лексики уроков твоего курса. Филворд — дополнительная практика: он не завершает основной урок.';
 const progress=loadProgress(),query=$('search').value.trim().toLowerCase(),level=$('level').value,status=$('status').value;
 const defs=catalog.filter(d=>d.source===source&&(!level||d.level===level)&&(!query||(d.title+' '+d.en).toLowerCase().includes(query))&&(!status||state(gamesFor(d)[0]?.[1])===status)&&(source!=='course'||!$('learned').checked||progress.lessons[d.lessonId]?.status==='done'));
 defs.sort((a,b)=>(state(gamesFor(a)[0]?.[1])==='playing'?0:1)-(state(gamesFor(b)[0]?.[1])==='playing'?0:1));
 $('cards').innerHTML=defs.map(d=>{const rounds=gamesFor(d),g=rounds[0]?.[1],s=state(g),n=foundCount(g),text=s==='new'?'Ещё не начат':s==='done'?'✓ Все слова найдены':'Найдено '+n+' из '+g.words.length;
  return `<article class="card"><div class="card-top"><span class="icon" aria-hidden="true">${esc(d.emoji)}</span><span class="badge">${esc(d.level)}</span></div><h3>${esc(d.title)}</h3><p class="english" lang="en">${esc(d.en)}</p><p class="details">${d.words.length} слов · ${d.words.some(w=>w.en.length>6)?14:13} × ${d.words.some(w=>w.en.length>6)?14:13}${source==='course'&&progress.lessons[d.lessonId]?.status==='done'?' · урок пройден':''}</p><p class="state">${text}</p><progress max="${g?.words.length||d.words.length}" value="${n}" aria-label="${esc(text)}"></progress><button class="primary" data-open="${esc(d.id)}">${s==='new'?'Начать':s==='done'?'Посмотреть':'Продолжить'} →</button></article>`;}).join('');
 $('empty').hidden=defs.length>0;
 const all=Object.values(app.hist),completed=all.filter(g=>state(g)==='done').length,playing=all.filter(g=>state(g)==='playing').length;
 $('totals').textContent='В процессе: '+playing+' · Решено сеток: '+completed;
}
function openGame(id,focus=true){
 const candidate=app.hist[id];if(!candidate)throw Error('Игра не найдена');
 const checked=hydrate(candidate);currentId=id;puzzle=checked;anchor=null;pointer=null;
 const g=game(),def=definition(g.definitionId);document.querySelector('.intro').hidden=true;$('catalogView').hidden=true;$('gameView').hidden=false;
 $('gameTitle').textContent=g.title;$('gameEnglish').textContent=g.en;$('gameMeta').textContent=(g.mode==='en'?'Знакомство':'Вспомни слово')+' · '+(def?.level||'')+' · '+puzzle.size+' × '+puzzle.size;
 $('wordNote').textContent=g.mode==='en'?'Найди английские слова. Значок ? подскажет первую букву в сетке.':'Вспомни английское слово по переводу. Значок ? раскроет слово и его первую букву в сетке.';
 $('board').style.setProperty('--size',puzzle.size);
 $('board').innerHTML=g.rows.flatMap((row,r)=>[...row].map((letter,c)=>`<button type="button" tabindex="${r===0&&c===0?0:-1}" data-r="${r}" data-c="${c}" aria-label="${letter}, строка ${r+1}, столбец ${c+1}">${letter}</button>`)).join('');
 const rounds=gamesFor({id:g.definitionId},g.mode);
 $('history').innerHTML=rounds.map(([key,record],i)=>`<option value="${esc(key)}"${key===id?' selected':''}>${record.created?new Date(record.created).toLocaleDateString('ru-RU')+' · '+new Date(record.created).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'Первая сетка'} · ${foundCount(record)}/${record.words.length}</option>`).join('');
 $('lessonLink').hidden=!def?.lessonFile;
 if(def?.lessonFile)$('lessonLink').href='player.html?lesson='+encodeURIComponent(def.lessonId);
 setPencil(false);$('feedback').textContent='';renderGameProgress();if(focus){$('gameTitle').focus();window.scrollTo({top:0,behavior:'smooth'});}
}
function renderGameProgress(){
 const g=game();if(!g)return;const n=foundCount(g),h=g.words.filter(w=>g.hints?.[w.en.toUpperCase()]===true).length;
 for(const option of $('history').options){const record=app.hist[option.value];if(record)option.textContent=(record.created?new Date(record.created).toLocaleDateString('ru-RU')+' · '+new Date(record.created).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'Первая сетка')+' · '+foundCount(record)+'/'+record.words.length;}
 $('count').textContent='Найдено '+n+' из '+g.words.length;$('hintCount').textContent='Подсказки: '+h;$('bar').max=g.words.length;$('bar').value=n;$('complete').hidden=n!==g.words.length;
 $('words').innerHTML=g.words.map((w,i)=>{const word=w.en.toUpperCase(),solved=g.found?.[word],hint=g.hints?.[word],visible=g.mode==='en'||solved||hint;
  return `<li class="${solved?'solved':''}" style="--fill:${colors[i%colors.length]}"><span class="word-label">${visible?`<span lang="en">${esc(word)}</span><small>${esc(w.ru)}</small>`:esc(w.ru)}${hint?'<small>С подсказкой</small>':''}</span>${visible?`<button data-speak="${esc(w.en)}" aria-label="Озвучить ${esc(w.en)}">♪</button>`:''}${!solved?`<button class="hint-btn" data-hint="${esc(word)}" aria-label="Подсказка: ${esc(g.mode==='en'?w.en:w.ru)}">?</button>`:''}</li>`;}).join('');
 for(const b of $('board').children){b.classList.remove('found','selected','hint','pencil-mark');b.style.removeProperty('--fill');b.setAttribute('aria-label',b.textContent+', строка '+(+b.dataset.r+1)+', столбец '+(+b.dataset.c+1));}
 g.words.forEach((w,i)=>{const word=w.en.toUpperCase();if(!g.found?.[word])return;const p=puzzle.placements.find(p=>p.word===word);for(const [r,c]of core.cells(p)){const b=cellButton([r,c]);b.classList.add('found');b.style.setProperty('--fill',colors[i%colors.length]);b.setAttribute('aria-label',b.getAttribute('aria-label')+', найдено '+word);}});
 for(const b of $('board').children){if(g.notes?.[b.dataset.r+'-'+b.dataset.c]===true){b.classList.add('pencil-mark');b.setAttribute('aria-label',b.getAttribute('aria-label')+', пометка карандашом');}}
 $('clearNotes').disabled=!Object.values(g.notes||{}).some(value=>value===true);
}
function setPencil(on){
 pencil=on;anchor=null;pointer=null;paint(null,null);
 $('pencil').setAttribute('aria-pressed',String(on));$('board').classList.toggle('pencil-mode',on);
 $('pencilHelp').textContent=on?'Карандаш включён. Нажми на клетку, чтобы поставить или снять пометку. Чтобы выделить слово, выключи карандаш.':'Включи карандаш, чтобы отмечать клетки для себя.';
}
function note(cell){
 const id=cell.join('-'),marked=game().notes?.[id]===true;
 try{commit(next=>{const record=next.hist[currentId];record.notes||={};record.notes[id]=!marked;});renderGameProgress();$('feedback').textContent=marked?'Пометка снята.':'Клетка отмечена карандашом.';}catch(error){showError(error);}
}
$('pencil').onclick=()=>setPencil(!pencil);
$('clearNotes').onclick=()=>{try{commit(next=>{const record=next.hist[currentId];for(const key of Object.keys(record.notes||{}))record.notes[key]=false;});anchor=null;renderGameProgress();$('feedback').textContent='Пометки стёрты. Найденные слова сохранены.';}catch(error){showError(error);}};
function cellButton([r,c]){return $('board').children[r*puzzle.size+c];}
function coords(target){const b=target?.closest?.('#board button');return b?[+b.dataset.r,+b.dataset.c]:null;}
function atPoint(e){return coords(document.elementFromPoint(e.clientX,e.clientY));}
function paint(start,end){for(const b of $('board').children)b.classList.remove('selected');if(!start||!end)return;const dy=end[0]-start[0],dx=end[1]-start[1];if(dy&&dx&&Math.abs(dy)!==Math.abs(dx))return;const n=Math.max(Math.abs(dy),Math.abs(dx));for(let i=0;i<=n;i++)cellButton([start[0]+Math.sign(dy)*i,start[1]+Math.sign(dx)*i]).classList.add('selected');}
function finish(start,end){
 const word=core.selected(puzzle,start,end);anchor=null;paint(null,null);
 if(!word){$('feedback').textContent='Здесь нет целого слова из списка. Попробуй ещё раз.';return;}
 if(game().found?.[word]){$('feedback').textContent='Это слово уже найдено.';return;}
 try{commit(next=>{next.hist[currentId].found[word]=true;});renderGameProgress();$('feedback').textContent=word+' — найдено!';}catch(e){showError(e);}
}
function activate(cell){if(pencil){note(cell);return;}if(anchor)finish(anchor,cell);else{anchor=cell;paint(cell,cell);$('feedback').textContent='Теперь выбери последнюю букву. Escape — отменить.';}}
$('board').addEventListener('pointerdown',e=>{if(!e.isPrimary||e.button!==0)return;const cell=coords(e.target);if(!cell)return;pointer=e.pointerId;dragStart=anchor||cell;lastCell=cell;moved=false;$('board').setPointerCapture(pointer);if(!pencil)paint(dragStart,cell);e.preventDefault();});
$('board').addEventListener('pointermove',e=>{if(pointer!==e.pointerId)return;const cell=atPoint(e);if(!cell)return;if(cell.join()!==lastCell.join())moved=true;lastCell=cell;if(!pencil)paint(dragStart,cell);});
$('board').addEventListener('pointerup',e=>{if(pointer!==e.pointerId)return;const end=atPoint(e);if(end){if(pencil){if(!moved)activate(end);}else if(moved||anchor)finish(dragStart,end);else activate(end);}else{anchor=null;paint(null,null);}pointer=null;if($('board').hasPointerCapture(e.pointerId))$('board').releasePointerCapture(e.pointerId);e.preventDefault();});
$('board').addEventListener('pointercancel',()=>{pointer=null;anchor=null;paint(null,null);});
$('board').addEventListener('click',e=>{if(e.detail===0){const cell=coords(e.target);if(cell)activate(cell);}});
$('board').addEventListener('keydown',e=>{const cell=coords(e.target);if(!cell)return;const steps={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]};if(e.key==='Escape'){anchor=null;paint(null,null);$('feedback').textContent='Выделение отменено.';return;}if(!steps[e.key])return;e.preventDefault();const next=cell.map((x,i)=>Math.max(0,Math.min(puzzle.size-1,x+steps[e.key][i])));e.target.tabIndex=-1;const button=cellButton(next);button.tabIndex=0;button.focus();if(anchor)paint(anchor,next);});
$('words').addEventListener('click',e=>{const hint=e.target.closest('[data-hint]'),speak=e.target.closest('[data-speak]');if(speak){AppVoice.speak(speak.dataset.speak).catch(showError);return;}if(!hint)return;const word=hint.dataset.hint;try{commit(next=>{next.hist[currentId].hints[word]=true;});anchor=null;renderGameProgress();const p=puzzle.placements.find(p=>p.word===word);cellButton(p.start).classList.add('hint');$('feedback').textContent=word+': первая буква выделена. Подсказка сохранена.';}catch(error){showError(error);}});
$('cards').addEventListener('click',e=>{const b=e.target.closest('[data-open]');if(!b)return;try{const def=definition(b.dataset.open);openGame(gamesFor(def)[0]?.[0]||create(def,mode));}catch(error){$('fatal').hidden=false;$('fatal').textContent=error.message;}});
$('back').onclick=()=>{anchor=null;pointer=null;currentId=null;$('gameView').hidden=true;document.querySelector('.intro').hidden=false;$('catalogView').hidden=false;renderCatalog();};
$('newGame').onclick=()=>{try{const g=game();if(!confirm('Создать новую сетку? Текущая останется в списке «Предыдущие сетки».'))return;const def=definition(g.definitionId);if(!def)throw Error('Эта тема больше не входит в каталог. Сохранённая игра доступна.');openGame(create(def,g.mode,true));}catch(e){showError(e);}};
$('history').onchange=e=>{try{openGame(e.target.value,false);}catch(error){showError(error);}};
for(const b of document.querySelectorAll('[data-source]'))b.onclick=()=>{source=b.dataset.source;for(const tab of document.querySelectorAll('[data-source]')){tab.classList.toggle('active',tab===b);tab.setAttribute('aria-pressed',String(tab===b));}renderCatalog();};
for(const id of ['search','level','status','learned'])$(id).addEventListener(id==='search'?'input':'change',renderCatalog);
$('mode').onchange=()=>{mode=$('mode').value;renderCatalog();};
function adoptLocal(){if(!ready)return;const latest=AppStore.peek('wordsearch');if(JSON.stringify(latest)===JSON.stringify(app))return;app=latest;app.hist||={};if(currentId&&app.hist[currentId]){anchor=null;renderGameProgress();}else renderCatalog();}
async function refresh(){if(!ready||pulling||document.hidden)return;pulling=true;try{await AppStore.open('wordsearch');adoptLocal();}catch{}finally{pulling=false;}}
try{
 await authReady;if(!currentUser){location.replace('index.html');return;}
 initializeAccountStorage();resumePendingSync();app=await AppStore.open('wordsearch');app.hist||={};ready=true;
 $('loading').hidden=true;$('app').hidden=false;renderCatalog();
 cloudLoadProgress().then(remote=>{if(remote){storeProgress(SyncCore.mergeProgress(loadProgress(),remote));if(!currentId)renderCatalog();}}).catch(()=>{});
 window.addEventListener('focus',refresh);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);
 setInterval(adoptLocal,1500);setInterval(refresh,30000);
}catch(error){$('loading').hidden=true;$('fatal').hidden=false;$('fatal').textContent='Не удалось открыть филворды: '+error.message+'. Обнови страницу, когда появится подключение.';}
})();
