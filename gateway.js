let serverCapabilities={groq:false,eleven:false,github:false};
async function gatewayResponse(path,body={},signal){
 if(!window.BACKEND_URL)throw Error('Сервер ещё не подключён');
 const base=new URL(window.BACKEND_URL);
 if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw Error('Неверный адрес сервера');
 if(!currentUser)throw Error('Сначала войди в аккаунт');
 const token=await currentUser.getIdToken();
 return fetch(base.origin+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal});
}
async function refreshCapabilities(){
 serverCapabilities={groq:false,eleven:false,github:false};
 if(!window.BACKEND_URL)return serverCapabilities;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await gatewayResponse('/status',{},controller.signal);
  if(!response.ok){
   let reason='';
   try{
    const body=await response.json();
    const known=['Сервер не настроен','Не удалось подтвердить вход','Аккаунт недоступен','Аккаунт не приглашён','Требуется вход','Origin запрещён','Сервер временно недоступен'];
    if(known.includes(body.error))reason=' — '+body.error;
   }catch{}
   throw Error('Сервер: '+response.status+reason);
  }
  const data=await response.json();serverCapabilities={groq:data.groq===true,eleven:data.eleven===true,github:data.github===true};
  return serverCapabilities;
 }finally{clearTimeout(timer);}
}
function purgeBrowserSecrets(){
 const secret=name=>['groqKey','elevenKey','ghToken'].some(k=>name.endsWith('setting.'+k));
 for(const key of Object.keys(localStorage)){
  if(secret(key)){localStorage.removeItem(key);continue;}
  if(key.endsWith('.legacy-backup')){
   try{const copy=JSON.parse(localStorage.getItem(key));for(const name of Object.keys(copy))if(secret(name))delete copy[name];localStorage.setItem(key,JSON.stringify(copy));}catch{}
  }
 }
}
