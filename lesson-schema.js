(function(root){
 function state(raw){
  if(raw===null)return null;
  if(Array.isArray(raw))raw={fields:raw};
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||JSON.stringify(raw).length>500000)throw Error('Некорректные ответы урока');
  const allowed=['signature','fieldsById','lessonState','fields','fillChecked','readChecked','quiz','tf','tfGroups','mc','checked','round','roundMatches','memo','match','prodDone','homework'];
  if(Object.keys(raw).some(k=>!allowed.includes(k)))throw Error('Неизвестные поля ответов');
  const number=n=>Number.isInteger(n)&&n>=-1&&n<=2000;
  const selections=a=>Array.isArray(a)&&a.length<=2000&&a.every(n=>n===null||number(n));
  const map=(v,keys,check)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length<=200&&Object.entries(v).every(([k,x])=>keys(k)&&check(x));
  for(const [k,v] of Object.entries(raw)){
   let valid=false;
   if(k==='signature')valid=typeof v==='string'&&/^[a-f0-9]{1,8}$/.test(v);
   else if(k==='fieldsById')valid=map(v,k=>/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(k),f=>f&&typeof f==='object'&&!Array.isArray(f)&&Object.keys(f).length===1&&(typeof f.v==='string'&&f.v.length<=20000||f.c===0||f.c===1));
   else if(k==='lessonState')valid=v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>['parts','done','visited'].includes(k))&&map(v.parts,k=>/^[a-z]{1,20}$/.test(k),x=>Number.isInteger(x)&&x>=0&&x<=10000)&&map(v.done,k=>/^[a-z]{1,20}$/.test(k),x=>typeof x==='boolean')&&map(v.visited,k=>['presentation','vocabulary','sounds'].includes(k),x=>typeof x==='boolean');
   else if(k==='fields')valid=Array.isArray(v)&&v.length<=2000&&v.every(f=>f&&typeof f==='object'&&!Array.isArray(f)&&Object.keys(f).length===1&&(typeof f.v==='string'&&f.v.length<=20000||f.c===0||f.c===1));
   else if(['fillChecked','readChecked','prodDone'].includes(k))valid=typeof v==='boolean';
   else if(['quiz','tf','mc'].includes(k))valid=selections(v);
   else if(k==='tfGroups')valid=map(v,k=>['tf1List','tf2List','tf3List','lsList'].includes(k),selections);
   else if(k==='checked')valid=map(v,k=>['checkQaBtn','checkTomBtn','submitTestBtn'].includes(k),x=>typeof x==='boolean');
   else if(k==='homework')valid=!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(x=>['on','c','t'].includes(x))&&(v.on===undefined||v.on===0||v.on===1)&&(v.c===undefined||(Array.isArray(v.c)&&v.c.length<=10&&v.c.every(x=>x===0||x===1||x===null)))&&(v.t===undefined||map(v.t,k=>/^[1-9]$/.test(k),x=>typeof x==='string'&&x.length<=20000));
   else if(k==='round')valid=number(v)&&v>=0;
   else if(k==='roundMatches')valid=map(v,k=>/^\d{1,4}$/.test(k),x=>selections(x)&&x.every(n=>n!==null&&n>=0));
   else if(['memo','match'].includes(k))valid=Array.isArray(v)&&v.length<=2000&&v.every(x=>typeof x==='string'&&/^\d{1,4}$/.test(x));
   if(!valid)throw Error('Некорректное поле ответов: '+k);
  }
  return JSON.parse(JSON.stringify(raw));
 }
 function result(v){
  if(!v||typeof v.completed!=='boolean'||!Number.isInteger(v.score)||v.score<0||v.score>10000||!Number.isInteger(v.maxScore)||v.maxScore<0||v.maxScore>10000)throw Error('Некорректный результат урока');
  return {score:v.maxScore?Math.min(v.score,v.maxScore):v.score,maxScore:v.maxScore,completed:v.completed};
 }
 root.LessonSchema={state,result};
})(typeof window==='undefined'?globalThis:window);
