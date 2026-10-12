/* Shared speech controls for dictionary, trainer and daily review. */
(function(root){
 let generation=0,checking=null;
 function provider(){
  const eleven=serverCapabilities.eleven&&getSetting('elevenVoice');
  if(getSetting('activeVoiceProvider')==='eleven'&&eleven)return 'eleven';
  return serverCapabilities.groq?'groq':eleven?'eleven':null;
 }
 function notice(text){
  let node=document.getElementById('appVoiceStatus');
  if(!node){node=document.createElement('div');node.id='appVoiceStatus';node.setAttribute('role','status');node.style.cssText='position:fixed;bottom:16px;left:16px;right:16px;z-index:1000;max-width:680px;margin:auto;padding:12px 16px;background:#FFFDFB;color:#3A2E33;border:1px solid #F3B3C5;border-radius:12px;box-shadow:0 4px 18px #3A2E3320;font:600 14px Nunito,sans-serif';document.body.append(node);}
  node.textContent=text;node.hidden=!text;
 }
 async function connect(){
  if(!checking)checking=refreshCapabilities().finally(()=>{checking=null;});
  return checking;
 }
 function browser(text,rate){
  return new Promise((resolve,reject)=>{
   if(!root.speechSynthesis||!root.SpeechSynthesisUtterance)return reject(Error('Голос браузера недоступен'));
   root.speechSynthesis.cancel();
   const u=new root.SpeechSynthesisUtterance(text);u.lang='en-US';u.rate=rate||1;
   const voices=root.speechSynthesis.getVoices(),voice=voices.find(v=>v.lang==='en-GB')||voices.find(v=>/^en[-_]/i.test(v.lang));if(voice)u.voice=voice;
   let timer=setTimeout(()=>{root.speechSynthesis.cancel();reject(Error('Голос браузера не запустился'));},120000);
   u.onend=()=>{clearTimeout(timer);resolve(true);};u.onerror=e=>{clearTimeout(timer);reject(Error('Голос браузера: '+(e.error||'ошибка')));};
   root.speechSynthesis.speak(u);
  });
 }
 async function speak(text,rate=1){
  const token=++generation,input=String(text||'').trim();if(!input)return false;
  notice('Подключаем озвучку…');let failure='';
  try{
   if(!provider())await connect();
   if(token!==generation)return false;
   const p=provider();if(!p)throw Error('Серверная озвучка не подключена');
   notice('Озвучка: '+(p==='groq'?'Groq':'ElevenLabs'));
   const played=await(p==='groq'?groqSpeak(input,rate):elevenSpeak(input,rate));
   if(token===generation)notice(played?'':'Нажми 🔊 ещё раз, чтобы запустить звук.');
   return played;
  }catch(e){failure=e.message||'Сервер не ответил';}
  if(token!==generation)return false;
  try{notice(failure+'. Пробуем голос браузера…');const played=await browser(input,rate);if(token===generation)notice('Сейчас используется голос браузера. Сервер: '+failure);return played;}
  catch(e){if(token===generation)notice('Не удалось включить звук: '+failure+'. '+e.message+'. Нажми 🔊 для повторной попытки.');return false;}
 }
 root.AppVoice={speak,provider};
})(window);
