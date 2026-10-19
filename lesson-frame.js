/* Parent side. Never reads the iframe DOM. */
(function(root){
 const channel='inglish.lesson.v1';
 function create(frame,handlers){
  let session=null,data=null,ready=false,restoreSent=false,timer=null,stored=null,closed=false,paused=false;
  const captures=new Map();
  function cancelCaptures(){for(const entry of captures.values()){clearTimeout(entry.timer);entry.reject(Error("Урок закрыт"));}captures.clear();}
  function send(type,payload={}){if(session)frame.contentWindow.postMessage({channel,session,type,...payload},'*');}
  async function receive(event){
   const msg=event.data;
   if(closed||paused||event.source!==frame.contentWindow||event.origin!=='null'||!msg||msg.channel!==channel||msg.session!==session)return;
   try{
    if(msg.type==='ready'&&!restoreSent){restoreSent=true;send('restore',{data:stored});return;}
    if(msg.type==='failure'){clearTimeout(timer);handlers.error(msg.reason==='lesson-updated'?'lesson-updated':'restore-failed',stored);return;}
    if(msg.type==='snapshot'&&restoreSent){
     const next=LessonSchema.state(msg.data),result=LessonSchema.result(msg.result);
     if(!next)throw Error('Пустой снимок урока');
     clearTimeout(timer);const first=!ready;ready=true;data=next;handlers.snapshot(next,result,first);
     const pending=captures.get(msg.requestId);if(pending){clearTimeout(pending.timer);captures.delete(msg.requestId);pending.resolve(next);}return;
    }
    if(msg.type==='stop-audio'&&ready){handlers.stop?.();return;}
    if(msg.type==='speak'&&ready&&Number.isSafeInteger(msg.id)&&typeof msg.text==='string'&&msg.text.length<=20000){
     const activeSession=session;
     try{const played=await handlers.speak(msg.text,typeof msg.rate==='number'&&Number.isFinite(msg.rate)?Math.max(0.1,Math.min(2,msg.rate)):1);if(session===activeSession)send('audio-result',{id:msg.id,...(played===false?{error:'Воспроизведение остановлено'}:{})});}
     catch(e){if(session===activeSession)send('audio-result',{id:msg.id,error:'Не удалось озвучить фразу'});}
    }
   }catch(e){handlers.error(e.message,stored);}
  }
  root.addEventListener('message',receive);
  async function load(path,answers){
   cancelCaptures();paused=false;ready=false;restoreSent=false;data=null;clearTimeout(timer);session=crypto.randomUUID();stored=LessonSchema.state(answers);
   if(!/^lessons\/[a-z0-9][a-z0-9-]{0,119}\.html$/.test(path))throw Error('Недопустимый путь урока');
   const activeSession=session;
   const controller=new AbortController(),fetchTimer=setTimeout(()=>controller.abort(),20000);
   let source,runtime,kit,template,theme;
   try{
    const responses=await Promise.all([fetch(path,{signal:controller.signal,cache:'no-cache'}),fetch('lesson-runtime.js?v=20261019-mobile1',{signal:controller.signal}),fetch('lesson-kit.js?v=20261018-fulltext1',{signal:controller.signal}),fetch('lesson-template.js?v=20261018-games1',{signal:controller.signal}),fetch('lesson-theme.css',{signal:controller.signal})]);
    if(responses.some(r=>!r.ok))throw Error('Не удалось загрузить урок');
    [source,runtime,kit,template,theme]=await Promise.all(responses.map(r=>r.text()));
   }finally{clearTimeout(fetchTimer);}
   if(session!==activeSession||closed)return;
   const doc=new DOMParser().parseFromString(source,'text/html');
   for(const external of doc.querySelectorAll('script[src]')){const localSource=external.getAttribute('src').split('?')[0];if(localSource==='../lesson-kit.js'){external.removeAttribute('src');external.textContent=kit;}else if(localSource==='../lesson-template.js'){external.removeAttribute('src');external.textContent=template;}}
   for(const link of doc.querySelectorAll('link[rel=stylesheet]'))if(link.getAttribute('href')==='../lesson-theme.css'){const style=doc.createElement('style');style.textContent=theme;link.replaceWith(style);}
   // Inline only raster assets under this lesson's directory; the sandbox keeps connect-src none.
   const rasterCache=new Map();
   for(const img of doc.querySelectorAll('img[data-lesson-image]')){
    const relative=img.dataset.lessonImage;
    if(!/^img\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}\.(png|jpg|jpeg|webp)$/.test(relative))continue;
    try{
     if(!rasterCache.has(relative)){
      const imageController=new AbortController(),imageTimer=setTimeout(()=>imageController.abort(),5000);
      let response,blob;try{response=await fetch('lessons/'+relative,{redirect:'error',signal:imageController.signal});if(response.ok)blob=await response.blob();}finally{clearTimeout(imageTimer);}
      if(!response.ok||blob.size>2000000||!/^image\/(png|jpeg|webp)$/.test(blob.type)){rasterCache.set(relative,null);continue;}
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
      rasterCache.set(relative,{data,variable:'--lesson-raster-'+rasterCache.size});
     }
     const raster=rasterCache.get(relative);if(!raster)continue;
     // Vocabulary atlas cells share one data URL instead of copying the full sheet into every cell.
     if(img.parentElement?.classList.contains('vocab-art-window')){
      doc.documentElement.style.setProperty(raster.variable,'url("'+raster.data+'")');
      img.parentElement.style.backgroundImage='var('+raster.variable+')';img.remove();continue;
     }
     img.src=raster.data;
     if(img.parentElement?.classList.contains('lesson-panel-window'))img.parentElement.style.backgroundImage='url("'+img.src+'")';
     img.style.display='';const placeholder=doc.getElementById('picPh');if(placeholder)placeholder.style.display='none';
    }catch{}
   }
   if(session!==activeSession||closed)return;
   doc.querySelectorAll('base,meta[http-equiv]').forEach(el=>el.remove());
   const policy=doc.createElement('meta');policy.httpEquiv='Content-Security-Policy';
   policy.content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src data: blob:; media-src blob: data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
   doc.head.prepend(policy);
   const script=doc.createElement('script');
   script.textContent='window.__lessonBridgeConfig='+JSON.stringify({session,parentOrigin:location.origin})+';\n'+runtime;
   doc.body.appendChild(script);
   frame.setAttribute('sandbox','allow-scripts allow-modals');frame.setAttribute('referrerpolicy','no-referrer');
   timer=setTimeout(()=>handlers.error('Урок не ответил. Перезагрузи страницу.',stored),30000);
   frame.srcdoc='<!DOCTYPE html>\n'+doc.documentElement.outerHTML;
  }
  return {load,setHomework:on=>send('hw-flag',{on:on?1:0}),capture:()=>data,request:()=>send('capture'),captureAsync:()=>new Promise((resolve,reject)=>{if(!ready||paused){reject(Error('Урок ещё не готов'));return;}const requestId=crypto.randomUUID();const timer=setTimeout(()=>{captures.delete(requestId);reject(Error('Не удалось получить свежие ответы. Попробуй ещё раз.'));},4000);captures.set(requestId,{resolve,reject,timer});send('capture',{requestId});}),pause:()=>{paused=true;ready=false;cancelCaptures();send('pause');},destroy:()=>{closed=true;cancelCaptures();clearTimeout(timer);root.removeEventListener('message',receive);frame.srcdoc='';}};
 }
 root.LessonFrame={create};
})(window);
