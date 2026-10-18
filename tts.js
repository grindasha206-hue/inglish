/* Shared TTS transport. Existing providers, no build step. */
(function(root){
  function chunks(text,limit,sentences=false){
    const input=String(text).trim(),out=[];
    // Orpheus can finish after the first sentence of a multi-sentence request.
    // Keep paragraph/sentence boundaries; never send the next sentence in that request.
    const pieces=sentences?input.split(/\r?\n+/).flatMap(line=>line.match(/.+?(?:[.!?…]+["”’')\]]*(?=\s|$)|$)/g)||[]):[input];
    for(const piece of pieces){let rest=piece.replace(/\s+/g,' ').trim();
    while(rest){
      let end=Math.min(rest.length,limit);
      if(end<rest.length){const space=rest.lastIndexOf(' ',end);if(space>limit/2)end=space;}
      out.push(rest.slice(0,end).trim());rest=rest.slice(end).trim();
    }
    }
    return out;
  }
  let active=null;
  function stop(){root.speechSynthesis?.cancel();if(active){active.pause();active=null;}}
  function play(url,rate){
    stop();const audio=new Audio(url);active=audio;
    audio.playbackRate=rate&&rate<=0.6?0.72:Math.max(0.6,Math.min(1.5,Number(rate)||1));
    return new Promise((resolve,reject)=>{
      let timer;
      const done=err=>{clearTimeout(timer);audio.onended=audio.onpause=audio.onerror=null;if(active===audio)active=null;err?reject(err):resolve();};
      audio.onended=()=>done();audio.onpause=()=>done(Object.assign(new Error('Воспроизведение остановлено'),{name:'AbortError'}));audio.onerror=()=>done(new Error('Не удалось воспроизвести аудио'));
      timer=setTimeout(()=>{done(new Error('Превышено время воспроизведения'));audio.pause();},180000);
      Promise.resolve().then(()=>audio.play()).catch(done);
    });
  }
  function engine(config){
    const urls=new Map(),pending=new Map();let queue=Promise.resolve(),last=null;
    async function address(input,voice){
      const scope=cloudUserId()||'signed-out';
      const bytes=new TextEncoder().encode(JSON.stringify([scope,config.model,voice,config.settings,input]));
      const hash=await crypto.subtle.digest('SHA-256',bytes);
      return '/tts-cache/v2/'+Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
    }
    async function request(input,voice,key,cacheKey){
      let store;try{store=await caches.open(config.cache);const hit=await store.match(cacheKey);if(hit)return hit.blob();}catch{}
      for(let attempt=0;attempt<3;attempt++){
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);let response,blob;
        try{
          response=config.transport?await config.transport(input,voice,controller.signal):await fetch(config.url(voice),{method:'POST',headers:config.headers(key),body:JSON.stringify(config.body(input,voice)),signal:controller.signal});
          if(response.ok){blob=await response.blob();if(!blob.size)throw new Error('Пустой ответ озвучки');}
          else {
            let detail='';try{const data=await response.json();detail=data.error?.message||data.detail?.message||data.detail?.status||'';}catch{}
            const error=new Error(config.name+' '+response.status+(detail?': '+detail:''));
            if(response.status!==429||attempt===2||/quota|credit|insufficient/i.test(detail))throw error;
          }
        }catch(error){if(error.name==='AbortError')throw new Error(config.name+': время ожидания истекло');throw error;}
        finally{clearTimeout(timer);}
        if(blob){
          if(store)try{await store.put(cacheKey,new Response(blob));const keys=await store.keys();for(const old of keys.slice(0,Math.max(0,keys.length-200)))await store.delete(old);}catch{}
          return blob;
        }
        const retry=response.headers.get('Retry-After');
        let delay=retry?Number(retry)*1000:1800*(attempt+1);
        if(retry&&!Number.isFinite(delay))delay=Date.parse(retry)-Date.now();
        if(!Number.isFinite(delay)||delay<0)delay=1800*(attempt+1);
        if(delay>10000)throw new Error(config.name+' 429: повтори запрос позже');
        await new Promise(resolve=>setTimeout(resolve,delay));
      }
    }
    async function urlFor(input,voice,key){
      const id=await address(input,voice);
      if(urls.has(id)){const value=urls.get(id);urls.delete(id);urls.set(id,value);return value;}
      if(!pending.has(id)){
        const task=queue.catch(()=>{}).then(()=>request(input,voice,key,id)).then(blob=>{
          const url=URL.createObjectURL(blob);urls.set(id,url);
          if(urls.size>32){const oldest=urls.keys().next().value;URL.revokeObjectURL(urls.get(oldest));urls.delete(oldest);}return url;
        }).finally(()=>pending.delete(id));queue=task;pending.set(id,task);
      }
      return pending.get(id);
    }
    async function speak(text,rate,voiceOverride){
      const key=config.enabled?'server':getSetting(config.key),voice=voiceOverride||getSetting(config.voice)||config.defaultVoice;
      if(config.enabled&&!config.enabled())throw new Error('Серверная озвучка не подключена');
      if(!key)throw new Error('no-key');if(!voice)throw new Error('no-voice');
      const input=String(text).trim();if(!input)return;
      if(input.length>20000)throw new Error('Слишком длинный текст для озвучки');
      const token=++root.TTS.generation;stop();last={text:input,rate,voice};
      for(let part of chunks(input,config.limit,config.punctuation)){
        if(config.punctuation&&!/[.!?…]$/.test(part))part+='.';
        if(token!==root.TTS.generation)return false;
        const url=await urlFor(part,voice,key);
        if(token!==root.TTS.generation)return false;
        try{await play(url,rate);}catch(error){if(error.name==='AbortError'||token!==root.TTS.generation)return false;throw error;}
      }
      return token===root.TTS.generation;
    }
    async function regenerate(){
      if(!last)return false;
      const saved=last;
      for(let part of chunks(saved.text,config.limit,config.punctuation)){
        if(config.punctuation&&!/[.!?…]$/.test(part))part+='.';
        const id=await address(part,saved.voice);if(urls.has(id)){URL.revokeObjectURL(urls.get(id));urls.delete(id);}
        try{await(await caches.open(config.cache)).delete(id);}catch{}
      }
      await speak(saved.text,saved.rate,saved.voice);return true;
    }
    return {speak,regenerate};
  }
  root.TTS={engine,chunks,generation:0,stop:()=>{root.TTS.generation++;stop();}};
})(window);
