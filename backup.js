/* Full backup excludes settings, credentials and authentication tokens. */
function validateFullBackup(raw,uid=cloudUserId()){
 if(!raw||raw.format!=='inglish-backup'||raw.version!==1||raw.uid!==uid)throw Error('Копия принадлежит другому аккаунту или имеет неизвестный формат');
 const progress=SyncCore.validateProgress(raw.progress),lessons={};
 if(!SyncCore.plain(raw.lessons)||Object.keys(raw.lessons).length>250)throw Error('Некорректные уроки копии');
 for(const [id,data]of Object.entries(raw.lessons)){if(!SyncCore.safeId(id))throw Error('Некорректный ID урока');lessons[id]=LessonSchema.state(data);}
 const conflicts=raw.conflicts||[];
 if(!Array.isArray(conflicts)||conflicts.length>250)throw Error('Некорректные конфликтные копии');
 const clean=conflicts.map(c=>{if(!c||!SyncCore.safeId(c.lessonId))throw Error('Некорректная конфликтная копия');return {lessonId:c.lessonId,data:LessonSchema.state(c.data)};});
 return {format:'inglish-backup',version:1,uid,progress,lessons,conflicts:clean};
}
async function exportFullBackup(){
 try{
  if(flushing||syncJobs.size)throw Error('Дождись отправки текущих изменений');
  const uid=cloudUserId(),prefix=accountKey('lessonState.',uid);
  const ids=new Set(['app-dictionary','app-trainer','app-review','app-wordsearch',...ALL_LESSONS.map(l=>l.id),...Object.keys(localStorage).filter(k=>k.startsWith(prefix)).map(k=>k.slice(prefix.length))]);
  const lessons={};setSyncStatus('pending','Собираем ответы из браузера и облака…');
  for(const id of ids){if(!SyncCore.safeId(id))continue;lessons[id]=await cloudLoadLessonState(id);if(uid!==cloudUserId())throw Error('Аккаунт изменился');}
  const remote=await cloudLoadProgress(uid);
  if(uid!==cloudUserId())throw Error('Аккаунт изменился');
  const progress=SyncCore.mergeProgress(loadProgress(),remote||SyncCore.emptyProgress());storeProgress(progress,uid);
  const conflicts=Object.keys(localStorage).filter(k=>k.startsWith(accountKey('conflict.',uid))).map(k=>JSON.parse(localStorage.getItem(k)));
  const copy=validateFullBackup({format:'inglish-backup',version:1,uid,progress,lessons,conflicts},uid);
  downloadJSON({...copy,savedAt:new Date().toISOString()},'english-full-backup-'+todayKey()+'.json');
  setSyncStatus('saved','Полная копия скачана: результаты и ответы текущего курса.');
 }catch(e){setSyncStatus('error','Полная копия не создана: '+e.message+'. Проверь подключение и повтори.');}
}
function resumeBackupRestore(){
 const uid=cloudUserId(),key=accountKey('restore-journal'),raw=localStorage.getItem(key);if(!raw)return;
 const journal=JSON.parse(raw);
 if(journal.uid!==uid||!Array.isArray(journal.updates)||journal.updates.length>510)throw Error('Некорректный журнал восстановления');
 for(const [name,value]of journal.updates){
  if(typeof value!=='string'||!(name===accountKey('progress.v2')||name===accountKey('pendingProgress')||name.startsWith(accountKey('lessonState.'))||name.startsWith(accountKey('conflict.'))))throw Error('Некорректная запись восстановления');
  localStorage.setItem(name,value);
 }
 localStorage.removeItem(key);resumePendingSync();
}
function importBackup(file,onDone){
 if(file.size>20*1024*1024){onDone?.(false);return;}
 const reader=new FileReader();reader.onerror=()=>onDone?.(false);
 reader.onload=()=>{
  try{
   const raw=JSON.parse(reader.result);
   if(raw?.format!=='inglish-backup'){importProgress(file,onDone);return;}
   const uid=cloudUserId(),copy=validateFullBackup(raw,uid);
   if(flushing||syncJobs.size)throw Error('Сначала дождись сохранения текущих изменений');
   const count=Object.values(copy.lessons).filter(Boolean).length;
   if(!confirm('Восстановить ответы '+count+' уроков из копии?\nОтветы этих уроков будут заменены. Результаты прохождения объединятся. Текущие ответы предварительно сохраним отдельно в этом браузере.')){onDone?.(false);return;}
   const before={progress:loadProgress(),lessons:Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith(accountKey('lessonState.'))).map(k=>[k,localStorage.getItem(k)]))};
   localStorage.setItem(accountKey('before-restore.'+Date.now()),JSON.stringify(before));
   const updates=[[accountKey('progress.v2'),JSON.stringify(SyncCore.mergeProgress(loadProgress(),copy.progress))],[accountKey('pendingProgress'),'1']];
   for(const [id,data]of Object.entries(copy.lessons))if(data!==null)updates.push([lessonStorageKey(id),JSON.stringify({schemaVersion:2,epoch:crypto.randomUUID(),revision:0,data,base:null,pending:true,reset:true})]);
   for(const c of copy.conflicts)updates.push([accountKey('conflict.'+c.lessonId+'.'+crypto.randomUUID()),JSON.stringify({...c,savedAt:new Date().toISOString(),paths:['backup-import']})]);
   localStorage.setItem(accountKey('restore-journal'),JSON.stringify({uid,updates}));
   resumeBackupRestore();onDone?.(true);
  }catch(e){setSyncStatus('error',e.message);onDone?.(false);}
 };
 reader.readAsText(file);
}
