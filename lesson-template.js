/* Shared A–H lesson engine. Account data and server keys stay in the parent. */
(function(root){
function mount(c){
 const d=document,$=id=>d.getElementById(id),norm=LessonKit.normalize;
 root.lessonStateVersion=c.slug+'-template-v1';root.speak=(...args)=>LessonKit.speak(...args);
 let visited={presentation:false,vocabulary:false,sounds:false},production=false,picture=false,round=0;
 const roundMatches={},parts={},done={},maximum={};
 const partKey=key=>({tf1List:'readone',tf2List:'readtwo',tf3List:'listen'}[key]||key.toLowerCase());
 const escape=s=>String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 function award(key,ok,n,max=2){key=partKey(key);maximum[key]=max;parts[key]=Math.round(max*ok/n);done[key]=ok>=Math.ceil(n*.8);update();}
 function update(){
  const score=Object.values(parts).reduce((a,b)=>a+b,0),maxScore=Object.values(maximum).reduce((a,b)=>a+b,0);
  if($('scoreDisplay')){$('scoreDisplay').textContent=score;$('scoreDisplay').parentElement.lastChild.textContent='/'+maxScore;}
  $('finalBadge')?.classList.toggle('shown',complete());
  for(const [bar,value]of Object.entries({'bar-p':visited.presentation?100:0,'bar-vocab':visited.vocabulary?100:0,'bar-sound':visited.sounds?100:0,'bar-pr':percent(['fill','memo','quiz','match','exam']),'bar-read':percent(['tfList','tf1List','tf2List','transfer','rfill']),'bar-listen':percent(['lsList','tf3List']),'bar-prod':production&&(!c.themes||picture)?100:0,'bar-hw':[...d.querySelectorAll('.hw-check:checked')].length*20}))if($(bar))$(bar).style.width=value+'%';
 }
 function percent(keys){const available=keys.map(partKey).filter(k=>k in maximum);return available.length?100*available.filter(k=>done[k]).length/available.length:0;}
 function complete(){return Object.values(visited).every(Boolean)&&Object.keys(maximum).length>0&&Object.keys(maximum).every(k=>done[k]);}
 root.lessonResult=()=>({score:Object.values(parts).reduce((a,b)=>a+b,0),maxScore:Object.values(maximum).reduce((a,b)=>a+b,0),completed:complete()});
 root.getLessonState=()=>({parts:{...parts},done:{...done},visited:{...visited}});
 root.restoreLessonState=s=>{for(const key of Object.keys(visited))if(s.visited?.[key])visited[key]=true;update();};
 const legacyMap=c.legacyFields.map((f,i)=>f.id||('legacy-'+i));
 root.migrateLessonState=s=>{
  if(s?.signature!==c.legacySignature && !(s&&!s.signature&&!s.fieldsById&&s.fields?.length===legacyMap.length))return s;
  return {...s,signature:signature(root.lessonStateVersion),fieldsById:Object.fromEntries((s.fields||[]).map((value,i)=>[legacyMap[i],value])),lessonState:{parts:{},done:{},visited:{}}};
 };
 function signature(text){let h=2166136261;for(const ch of text)h=Math.imul(h^ch.charCodeAt(0),16777619);return(h>>>0).toString(16);}
 function buildFields(id,data){const el=$(id);el.replaceChildren();data.forEach((x,i)=>{
  const row=d.createElement('div');row.className='fill-item';const body=d.createElement('div');body.className='fill-body';row.append(body);
  let j=0,sentence=x.sentence||x.q||x.words||'';if(!sentence.includes('___'))sentence+=' ___';
  body.innerHTML=`<span class="fill-num">${i+1}</span> `+escape(sentence).replaceAll('___',()=>`<input class="blank-input" type="text" id="${id}-${i}-${j}" data-item="${i}" data-part="${j++}" autocomplete="off" spellcheck="false">`);
  body.querySelectorAll('input').forEach(input=>input.setAttribute('aria-label',`${i+1}. ${sentence.replaceAll('___','ответ')} — пропуск ${+input.dataset.part+1}`));el.append(row);
 });}
 function checkFields(id,data,feedback,key){let correct=0;data.forEach((x,i)=>{let good=true;const inputs=[...$(id).querySelectorAll(`input[data-item="${i}"]`)];inputs.forEach((input,j)=>{const answers=x.split?x.parts[j].answers:x.answers;const ok=answers.some(a=>norm(a)===norm(input.value));input.classList.toggle('correct',ok);input.classList.toggle('wrong',!ok);good&&=ok;});if(good)correct++;});$(feedback).textContent=`Правильно: ${correct} из ${data.length}`;award(key,correct,data.length,key==='fill'?3:2);}
 function fields(id,data,button,feedback,key){if(!data?.length)return;maximum[key]=key==='fill'?3:2;buildFields(id,data);$(button).addEventListener('click',()=>checkFields(id,data,feedback,key));$(id).addEventListener('input',()=>{parts[key]=0;done[key]=false;$(feedback).textContent='';update();});}
 // Vocabulary contains all old entries; phonetic annotations belong in Sounds.
 const vocab=$('vocabTable');vocab.replaceChildren();
 const groups=c.themes||[{title:'Слова урока',words:(c.vocabData||[]).map(x=>[x.word,x.ru])}];
 for(const group of groups){if(c.themes){const h=d.createElement('h3');h.textContent=group.title;vocab.append(h);}let extra=null;for(const [index,[word,ru]]of group.words.entries()){const row=d.createElement('div');row.className='vocab-row';row.innerHTML=`<button class="play-btn" data-text="${escape(word)}">🔊</button><b>${escape(word)}</b><span class="ru">${escape(ru)}</span>`;if(!c.themes&&index>=12){if(!extra){extra=d.createElement('details');extra.innerHTML='<summary>Ещё слова из прежней версии урока</summary>';vocab.append(extra);}extra.append(row);}else vocab.append(row);}}
 $('chunkGrid').innerHTML=(c.chunkData||[]).map(x=>`<div class="chunk-card"><button class="play-btn" data-text="${escape(x.en)}">🔊</button><b>${escape(x.en)}</b><span>${escape(x.ru)}</span></div>`).join('');
 fields('fillList',c.fillData,'checkFillBtn','fillFeedback','fill');
 fields('readFillList',c.readFillData,'checkReadFillBtn','readFillFeedback','rfill');
 fields(c.qaData?'qaList':'tomFillList',c.qaData||c.tomData,c.qaData?'checkQaBtn':'checkTomBtn',c.qaData?'qaFeedback':'tomFeedback','transfer');
 $('resetFillBtn')?.addEventListener('click',()=>{$('fillList').querySelectorAll('input').forEach(x=>{x.value='';x.classList.remove('correct','wrong');});$('fillFeedback').textContent='';parts.fill=0;done.fill=false;update();});
 if(c.quizData){maximum.quiz=3;const el=$('quizList');el.replaceChildren();c.quizData.forEach((x,i)=>{const row=d.createElement('div');row.className='quiz-q';row.innerHTML=`<p>${i+1}. ${escape(x.q)}</p><div class="quiz-opts">${x.opts.map(opt=>`<button class="quiz-opt" data-correct="${opt===x.correct}">${escape(opt)}</button>`).join('')}</div>`;row.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{row.querySelector('.quiz-opts').dataset.done='1';row.querySelectorAll('button').forEach(b=>b.classList.remove('sel-correct','sel-wrong'));btn.classList.add(btn.dataset.correct==='true'?'sel-correct':'sel-wrong');const ok=el.querySelectorAll('.sel-correct').length;$('quizFeedback').textContent=`Правильно: ${ok} из ${c.quizData.length}`;award('quiz',ok,c.quizData.length,3);}));el.append(row);});}
 for(const [id,group]of Object.entries(c.tfGroups)){
  maximum[partKey(id)]=2;$(id).replaceChildren();LessonKit.buildTF(id,group.data,group.feedback,(ok,n)=>{award(id,ok,n);unlockScript();});
 }
 function unlockScript(){const id=c.themes?'tf3List':'lsList';if($('toggleScriptBtn'))$('toggleScriptBtn').disabled=[...$(id).children].some(row=>!row.dataset.done);}
 if(c.memoPairs){maximum.memo=2;let selected=null,locked=false;const deck=LessonKit.memoWords(c.memoPairs,c.matchWords||(c.vocabData||[])),memoPairs=deck.pairs;
  const lead=$('panel-memo')?.querySelector('.lead');if(lead)lead.textContent='Найдите пары: английское слово и его русский перевод.';
  function memo(){const el=$('memoGrid');el.replaceChildren();selected=null;locked=false;const cards=memoPairs.flatMap((pair,i)=>pair.map(text=>({text,i:i+deck.offset}))).sort(()=>Math.random()-.5);for(const card of cards){const elc=d.createElement('div');elc.className='memo-card';elc.dataset.pair=card.i;elc.innerHTML='<div class="memo-inner"><div class="memo-face back">?</div><div class="memo-face front">'+escape(card.text)+'</div></div>';elc.setAttribute('aria-label','Открыть карточку');elc.addEventListener('click',()=>{if(locked||elc.classList.contains('matched')||selected===elc)return;elc.classList.add('flipped');elc.setAttribute('aria-label',card.text);if(!selected){selected=elc;return;}const first=selected;selected=null;elc.setAttribute('aria-label',card.text);if(first.dataset.pair===elc.dataset.pair){first.classList.add('matched');elc.classList.add('matched');const n=$('memoGrid').querySelectorAll('.matched').length/2;$('memoStatus').textContent=`Найдено пар: ${n} / ${memoPairs.length}`;award('memo',n,memoPairs.length);done.memo=n===memoPairs.length;update();}else{locked=true;setTimeout(()=>{first.classList.remove('flipped');elc.classList.remove('flipped');locked=false;},400);}});el.append(elc);}}
  memo();$('restartMemoBtn').addEventListener('click',()=>{memo();parts.memo=0;done.memo=false;$('memoStatus').textContent=`Найдено пар: 0 / ${memoPairs.length}`;update();});
 }
 if(c.matchWords){maximum.match=2;const rounds=(c.rounds||[{name:'Слова',pairs:c.matchWords}]).map(r=>({...r,pairs:LessonKit.wordPairs(r.pairs)}));
  function matches(){let selected=null;for(const [id,side]of [['matchEnCol',0],['matchRuCol',1]]){$(id).replaceChildren();rounds[round].pairs.map((pair,i)=>({pair,i})).sort(()=>Math.random()-.5).forEach(({pair,i})=>{const tile=d.createElement('div');tile.className='match-tile';tile.dataset.idx=i;tile.textContent=pair[side];if((roundMatches[round]||[]).includes(String(i)))tile.classList.add('matched');tile.addEventListener('click',()=>{if(tile.classList.contains('matched'))return;if(!selected){selected=tile;tile.classList.add('selected');return;}if(selected.parentElement===tile.parentElement){selected.classList.remove('selected');selected=tile;tile.classList.add('selected');return;}if(selected.dataset.idx===tile.dataset.idx){selected.classList.add('matched');tile.classList.add('matched');roundMatches[round]=[...new Set([...(roundMatches[round]||[]),String(i)])];}selected.classList.remove('selected');selected=null;status();});$(id).append(tile);});}if($('roundButtons'))[...$('roundButtons').children].forEach((b,i)=>b.classList.toggle('active',i===round));status();}
  function status(){const n=Object.values(roundMatches).reduce((n,a)=>n+a.length,0),total=rounds.reduce((n,r)=>n+r.pairs.length,0);$('matchStatus').textContent=`Раунд ${round+1}: ${roundMatches[round]?.length||0} / ${rounds[round].pairs.length} · всего ${n} / ${total}`;award('match',n,total);done.match=n===total;update();}
  rounds.forEach((r,i)=>{if($('roundButtons')){const btn=d.createElement('button');btn.className='btn secondary small round-btn';btn.textContent=r.name;btn.addEventListener('click',()=>{round=i;matches();});$('roundButtons').append(btn);}});
  root.lessonRound=()=>round;root.lessonRoundMatches=()=>Object.fromEntries(Object.entries(roundMatches).map(([k,a])=>[k,a.map(Number)]));root.restoreRoundMatches=(saved,r)=>{for(const key of Object.keys(roundMatches))delete roundMatches[key];for(const [key,list]of Object.entries(saved))if(rounds[key])roundMatches[key]=[...new Set(list.map(String))].filter(i=>/^\d+$/.test(i)&&+i<rounds[key].pairs.length);round=rounds[r]?r:0;matches();};
  matches();$('restartMatchBtn').addEventListener('click',()=>{delete roundMatches[round];matches();});
 }
 if(c.exam){maximum.exam=24;d.querySelectorAll('.q-input').forEach(x=>x.addEventListener('input',()=>{done.exam=false;parts.exam=0;update();}));d.querySelectorAll('.mc-opt').forEach(x=>x.addEventListener('click',()=>{done.exam=false;parts.exam=0;update();}));$('submitTestBtn').addEventListener('click',()=>{const submitted=$('resultsCard').classList.contains('shown');if(submitted){const correct=d.querySelectorAll('.q-input.correct').length+d.querySelectorAll('.mc-opt.picked.correct').length;award('exam',correct,24,24);}});}
 maximum.prod=2;if($('pictureArea'))maximum.picture=2;
 const words=text=>(text.trim().match(/[A-Za-z]+(?:['’][A-Za-z]+)*/g)||[]).length;
 function checkProduction(){const text=$('writeArea').value,n=words(text),sentences=(text.match(c.questionTask?/\?/g:/[.!?](?:\s|$)/g)||[]).length;production=n>=25&&sentences>=(c.questionTask?6:5);$('wordCount').textContent=`${n} слов · `+(production?'✅ Текст принят. Проверьте грамматику по образцу.':`Нужно минимум 25 слов и ${c.questionTask?'6 вопросов':'5 предложений'}.`);award('prod',production?1:0,1);if($('pictureArea')){picture=words($('pictureArea').value)>=15;award('picture',picture?1:0,1);}}
 $('finishBtn').addEventListener('click',checkProduction);$('writeArea').addEventListener('input',()=>{production=false;parts.prod=0;done.prod=false;$('wordCount').textContent=words($('writeArea').value)+' слов';update();});
 $('pictureArea')?.addEventListener('input',()=>{picture=false;parts.picture=0;done.picture=false;update();});
 $('writeArea').insertAdjacentHTML('beforebegin',`<p class="sound-note">Для зачёта: минимум 25 слов и ${c.questionTask?'6 вопросов':'5 предложений'}.${$('pictureArea')?' Также опишите картинку выше: минимум 15 слов.':''} Автоматическая проверка грамматики не выполняется.</p>`);
 $('sampleBtn')?.addEventListener('click',()=>$('sampleBox').classList.toggle('shown'));$('showPicSample')?.addEventListener('click',()=>$('picSample').classList.toggle('shown'));
 // Stable field IDs are assigned before extra homework fields are appended.
 let hwIndex=0;
 for(const [i,f]of c.legacyFields.entries()){
  let el=f.id?$(f.id):f.type==='checkbox'?d.querySelectorAll('.hw-check')[hwIndex++]:d.querySelector('#'+f.list+` [data-item="${f.item}"]`+(f.part!==undefined?`[data-part="${f.part}"]`:''));
  if(el)el.id=legacyMap[i];
 }
 [...d.querySelectorAll('.hw-item')].forEach((item,i)=>{const check=item.querySelector('input');if(check&&!check.id)check.id='hwCheck'+(i+1);const body=d.createElement('div');body.className='hw-body';const wasLabel=item.tagName==='LABEL';if(wasLabel){const div=d.createElement('div');div.className=item.className;item.replaceWith(div);div.append(check);const label=d.createElement('label');label.htmlFor=check.id;while(item.firstChild)label.append(item.firstChild);body.append(label);div.append(body);}else{while(item.childNodes.length>1)body.append(item.childNodes[1]);item.append(body);}if([0,1,3].includes(i)){const label=d.createElement('label');label.htmlFor='hwText'+(i+1);label.textContent='Ваши записи к заданию '+(i+1);const input=d.createElement('textarea');input.className='hw-area';input.id=label.htmlFor;body.append(label,input);}});
 function homework(){const n=d.querySelectorAll('.hw-check:checked').length;if($('hwFeedback'))$('hwFeedback').textContent=`Выполнено: ${n} / 5`;update();}d.querySelectorAll('.hw-check').forEach(x=>x.addEventListener('change',homework));$('printHwBtn')?.addEventListener('click',()=>root.print());
 root.addEventListener('beforeprint',()=>{d.querySelectorAll('.print-answer').forEach(x=>x.remove());d.querySelectorAll('.hw-area').forEach(x=>{const p=d.createElement('div');p.className='print-answer';p.textContent=x.value||'____________________________';x.after(p);});});
 for(const key of Object.keys(visited)){new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){visited[key]=true;update();}},{threshold:.2}).observe($(key).querySelector('h2'));}
 d.querySelectorAll('.game-tab-btn').forEach(btn=>btn.addEventListener('click',()=>{d.querySelectorAll('.game-tab-btn').forEach(x=>x.classList.toggle('active',x===btn));d.querySelectorAll('.game-panel').forEach(x=>x.classList.toggle('active',x.id===btn.dataset.panel));}));
 // One playback path for clicks and sequences; cancellation prevents the next phrase.
 d.addEventListener('click',event=>{const b=event.target.closest('.play-btn');if(b){LessonKit.cancelSequence();root.speak(b.dataset.text,+b.dataset.rate||.95,b);}});
 const play=(id,lines,rate)=>$(id)?.addEventListener('click',()=>LessonKit.playSequence(typeof lines==='function'?lines():lines,typeof rate==='function'?rate():rate,$(id)));
 let rate=.95;d.querySelectorAll('.speed-btn').forEach(b=>b.addEventListener('click',()=>{rate=+b.dataset.rate;d.querySelectorAll('.speed-btn').forEach(x=>x.classList.toggle('active',x===b));}));
 play('playAllBtn',()=>[...d.querySelectorAll('.sound-block .play-btn:not(.slow)')].map(b=>b.dataset.text),.95);play('playReadingBtn',c.readingLines,.95);play('playListeningBtn',c.listeningLines,()=>rate);
 $('toggleScriptBtn').disabled=true;$('toggleScriptBtn').addEventListener('click',()=>$('scriptBox').classList.toggle('shown'));
 if(!d.querySelector('#sounds .stop-audio'))$('sounds').querySelector('.content').insertAdjacentHTML('beforeend','<button class="btn secondary stop-audio">Остановить</button>');
 d.querySelectorAll('.stop-audio').forEach(b=>b.addEventListener('click',()=>{LessonKit.cancelSequence();LessonKit.stop();root.stopLessonAudio?.();}));
 update();homework();
}
root.LessonTemplate={mount};
})(window);
