/* The home card and its cover always refer to the same next lesson. */
(function(root){
 'use strict';
 const fallback='lessons/img/anna-v1.webp';
 function localImage(value,lessonURL){
  if(!value)return null;
  try{
   const url=new URL(value,lessonURL),folder=new URL('lessons/img/',document.baseURI);
   return url.origin===folder.origin&&url.pathname.startsWith(folder.pathname)&&/\.(webp|png|jpe?g)$/i.test(url.pathname)?url.href:null;
  }catch{return null;}
 }
 async function mount(img,lesson){
  if(!img||!lesson)return;
  const reset=()=>{img.onerror=null;img.src=fallback;img.alt='Анна — персонаж курса английского';img.style.objectFit='contain';};
  reset();
  try{
   const lessonURL=new URL(lesson.file,document.baseURI);
   const folder=new URL('lessons/',document.baseURI);
   if(lessonURL.origin!==folder.origin||!lessonURL.pathname.startsWith(folder.pathname)||!lessonURL.pathname.endsWith('.html'))return;
   const response=await fetch(lessonURL.href,{cache:'no-cache'});
   if(!response.ok)return;
   // Parse only: lesson scripts are never executed on the home page.
   const doc=new DOMParser().parseFromString(await response.text(),'text/html');
   const candidates=[...doc.querySelectorAll('img.lesson-scene[src]'),...doc.querySelectorAll('img.lesson-portrait[src]')];
   const source=candidates.find(el=>localImage(el.getAttribute('src'),lessonURL));
   if(!source||!img.isConnected)return;
   img.onerror=reset;
   img.alt=source.getAttribute('alt')||'Иллюстрация урока '+lesson.title;
   img.style.objectFit=source.classList.contains('lesson-portrait')?'contain':'cover';
   img.src=localImage(source.getAttribute('src'),lessonURL);
  }catch{/* Keep the character if the lesson cannot be fetched. */}
 }
 root.LessonCover={mount};
})(window);
