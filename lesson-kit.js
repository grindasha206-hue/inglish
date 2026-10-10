/* Shared helpers for new self-contained lessons; no account data or keys. */
(function(root){
 let generation=0,activeSequence=null,finishActive=null;
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 function normalize(value){return String(value).trim().toLowerCase().replace(/[’‘´`]/g,"'").replace(/[?.!,;:]/g,'').replace(/'/g,'').replace(/\s+/g,' ');}
 function cancelSequence(){generation++;if(activeSequence){activeSequence.disabled=false;activeSequence.removeAttribute('aria-busy');activeSequence=null;}}
 function stop(){if(finishActive){finishActive(false);finishActive=null;}root.speechSynthesis?.cancel();}
 function speak(text,rate,button){
  return new Promise(resolve=>{
   if(!root.speechSynthesis){const warning=document.getElementById('ttsWarn');if(warning){warning.textContent='Голос устройства недоступен. Откройте урок через плеер с подключённой озвучкой.';warning.classList.add('shown');}resolve(false);return;}
   stop();
   const utterance=new root.SpeechSynthesisUtterance(text),voices=root.speechSynthesis.getVoices();
   utterance.voice=voices.find(v=>v.lang==='en-GB')||voices.find(v=>v.lang?.startsWith('en'))||null;
   utterance.lang='en-GB';utterance.rate=rate||1;
   let settled=false;
   const finish=ok=>{if(settled)return;settled=true;button?.classList.remove('playing');resolve(ok);};
   finishActive=finish;
   utterance.onstart=()=>button?.classList.add('playing');utterance.onend=()=>finish(true);utterance.onerror=()=>finish(false);
   root.speechSynthesis.speak(utterance);
  });
 }
 async function playSequence(lines,rate,button){
  if(button?.disabled)return false;
  cancelSequence();const own= generation;activeSequence=button;
  if(button){button.disabled=true;button.setAttribute('aria-busy','true');}
  try{
   for(const text of lines){
    if(own!==generation)return false;
    const played=await root.speak(text,rate,button);
    if(played!==true||own!==generation)return false;
    await wait(350);
   }
   return true;
  }finally{if(own===generation)cancelSequence();}
 }
function buildFill(listId, data){
  const el = document.getElementById(listId);
  data.forEach((item, idx)=>{
    const row = document.createElement('div'); row.className = 'fill-item';
    row.innerHTML = `<div class="fill-num">${idx+1}</div><div class="fill-body"><div class="fill-words">${item.sentence.replace('___', `<input type="text" id="${listId}-${idx}" class="blank-input" data-item="${idx}" autocomplete="off" autocapitalize="off" spellcheck="false">`)}</div></div>`;
    row.querySelector('input').setAttribute('aria-label',`${idx+1}. ${item.sentence.replace('___','Ответ')}`);
    el.appendChild(row);
  });
}
function checkFill(listId, data, fbId){
  let ok = 0;
  data.forEach((item, idx)=>{
    const input = document.querySelector(`#${listId} .blank-input[data-item="${idx}"]`);
    const good = item.answers.some(a=>normalize(a)===normalize(input.value));
    input.classList.remove('correct','wrong'); input.classList.add(good?'correct':'wrong');
    if(good) ok++;
  });
  document.getElementById(fbId).textContent = `Правильно: ${ok} из ${data.length}`;
  return ok;
}


function buildTF(listId, data, fbId, onFinish){
  const el = document.getElementById(listId);
  let answered = 0, correct = 0;
  data.forEach((item, idx)=>{
    const row = document.createElement('div'); row.className = 'tf-item';
    row.innerHTML = `<div class="tf-text">${idx+1}. ${item.text}</div><div class="tf-btns"><button class="tf-btn" data-val="true">True</button><button class="tf-btn" data-val="false">False</button></div>`;
    el.appendChild(row);
    row.querySelectorAll('.tf-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const first = !row.dataset.done;
        if(!first && row.dataset.correct === 'true') correct--;
        row.querySelectorAll('.tf-btn').forEach(b=>b.classList.remove('sel-correct','sel-wrong'));
        row.dataset.done = "1";
        const val = btn.dataset.val === "true";
        row.querySelectorAll('.tf-btn').forEach(b=>{ if((b.dataset.val === "true") === item.correct) b.classList.add('reveal-correct'); });
        btn.classList.add(val === item.correct ? 'sel-correct' : 'sel-wrong');
        row.dataset.correct = String(val === item.correct);
        if(first) answered++; if(val === item.correct) correct++;
        document.getElementById(fbId).textContent = `Отвечено: ${answered} из ${data.length} · верно: ${correct}`;
        if(answered === data.length)onFinish(correct, data.length);
      });
    });
  });
}


 root.LessonKit={normalize,buildFill,checkFill,buildTF,speak,playSequence,cancelSequence,stop};
})(window);
