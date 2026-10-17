/* Deterministic, fully checked word-search grids. Coordinates are zero-based. */
(function(root){
'use strict';
const dirs=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
function hash(text){let n=2166136261;for(const c of String(text))n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;}
function random(seed){let n=hash(seed);return ()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
function shuffle(a,rng){a=[...a];for(let i=a.length-1;i;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const key=p=>p.join(',');
function cells(p){const dr=Math.sign(p.end[0]-p.start[0]),dc=Math.sign(p.end[1]-p.start[1]);return Array.from({length:p.word.length},(_,i)=>[p.start[0]+dr*i,p.start[1]+dc*i]);}
function diagonals(path){return path.slice(1).flatMap((p,i)=>{const q=path[i],dr=p[0]-q[0],dc=p[1]-q[1];return dr&&dc?[[Math.min(p[0],q[0])+','+Math.min(p[1],q[1]),dr*dc]]:[];});}
function occurrences(rows,word){const n=rows.length,out=[],seen=new Set();for(let r=0;r<n;r++)for(let c=0;c<n;c++)for(const [dr,dc]of dirs){if(rows[r][c]!==word[0])continue;const end=[r+dr*(word.length-1),c+dc*(word.length-1)];if(end.some(x=>x<0||x>=n))continue;const path=Array.from({length:word.length},(_,i)=>[r+dr*i,c+dc*i]);if(path.every(([y,x],i)=>rows[y][x]===word[i])){const a=path.map(key).join(';'),b=[...path].reverse().map(key).join(';'),id=a<b?a:b;if(!seen.has(id)){seen.add(id);out.push({word,start:[r,c],end});}}}return out;}
function validate(puzzle,words){
 const {size:n,rows,placements}=puzzle;
 if(![13,14].includes(n)||!Array.isArray(rows)||rows.length!==n||rows.some(r=>typeof r!=='string'||r.length!==n||!/^[A-Z]+$/.test(r)))throw Error('Некорректная сетка');
 if(n!==(words.some(w=>w.length>6)?14:13)||placements.length!==words.length||new Set(words).size!==words.length)throw Error('Некорректный список слов');
 const used=new Set(),diag=new Map();
 for(const word of words){
  const matches=placements.filter(p=>p.word===word);if(matches.length!==1)throw Error('Нет размещения: '+word);
  const p=matches[0],dy=p.end[0]-p.start[0],dx=p.end[1]-p.start[1];
  if(![...p.start,...p.end].every(Number.isInteger)||!(dy===0||dx===0||Math.abs(dy)===Math.abs(dx))||Math.max(Math.abs(dy),Math.abs(dx))!==word.length-1)throw Error('Неверное направление');
  const path=cells(p);for(const [i,cell]of path.entries()){if(cell.some(x=>x<0||x>=n)||rows[cell[0]][cell[1]]!==word[i])throw Error('Слово выходит за сетку или написано неверно');if(used.has(key(cell)))throw Error('Общая клетка');used.add(key(cell));}
  for(const [block,slope]of diagonals(path)){if(diag.has(block)&&diag.get(block)!==slope)throw Error('X-пересечение');diag.set(block,slope);}
  const hits=occurrences(rows,word);if(hits.length!==1)throw Error('Лишнее или отсутствующее вхождение: '+word);
  const h=hits[0];if(!((key(h.start)===key(p.start)&&key(h.end)===key(p.end))||(key(h.start)===key(p.end)&&key(h.end)===key(p.start))))throw Error('Ответ не совпадает с сеткой');
 }
 if(placements.some(p=>!words.includes(p.word)))throw Error('Лишнее слово в ответах');
 return true;
}
function compatible(a,b){return !a.includes(b)&&!b.includes(a)&&!a.includes([...b].reverse().join(''))&&!b.includes([...a].reverse().join(''));}
/* Largest compatible subset up to ten, shuffled by a stable round seed. */
function pickWords(pool,seed,limit=10){
 if(!Number.isInteger(limit)||limit<2||limit>10)throw Error('Некорректный размер набора');
 const list=shuffle([...new Map(pool.map(w=>[String(w.en).toUpperCase(),w])).values()],random(seed));
 if(list.some(w=>!/^[A-Z]{3,14}$/.test(String(w.en).toUpperCase())))throw Error('Некорректное слово в теме');
 let best=[];
 function search(chosen,candidates){
  if(chosen.length>best.length)best=chosen;
  if(best.length===limit||chosen.length+candidates.length<=best.length)return;
  for(let i=0;i<candidates.length;i++){
   if(chosen.length+candidates.length-i<=best.length)return;
   const word=candidates[i];
   search([...chosen,word],candidates.slice(i+1).filter(other=>compatible(word.en.toUpperCase(),other.en.toUpperCase())));
   if(best.length===limit)return;
  }
 }
 search([],list);
 if(best.length<2)throw Error('В теме недостаточно совместимых слов');
 return best;
}
function generate(input,seed){
 const words=input.map(w=>String(w).toUpperCase());
 if(words.length<2||words.length>10||words.some(w=>!/^[A-Z]{3,14}$/.test(w))||new Set(words).size!==words.length)throw Error('Нужны 2–10 разных английских слов от 3 до 14 букв');
 for(let i=0;i<words.length;i++)for(let j=0;j<i;j++)if(!compatible(words[i],words[j]))throw Error('Одно слово содержится в другом');
 const rng=random(seed),size=words.some(w=>w.length>6)?14:13;
 for(let attempt=0;attempt<30;attempt++){
  const board=Array.from({length:size},()=>Array(size).fill('')),used=new Set(),diag=new Map(),placements=[];let budget=25000;
  const ordered=shuffle(words,rng).sort((a,b)=>b.length-a.length);
  function place(i){if(i===ordered.length)return true;const word=ordered[i],options=[];
   for(let r=0;r<size;r++)for(let c=0;c<size;c++)for(const [dr,dc]of dirs){const end=[r+dr*(word.length-1),c+dc*(word.length-1)];if(end.every(x=>x>=0&&x<size))options.push({word,start:[r,c],end});}
   for(const p of shuffle(options,rng)){if(--budget<0)return false;const path=cells(p),steps=diagonals(path);if(path.some(x=>used.has(key(x)))||steps.some(([k,s])=>diag.has(k)&&diag.get(k)!==s))continue;
    for(const [j,[r,c]]of path.entries()){board[r][c]=word[j];used.add(key([r,c]));}for(const [k,s]of steps)diag.set(k,s);placements.push(p);
    if(place(i+1))return true;placements.pop();for(const [r,c]of path){board[r][c]='';used.delete(key([r,c]));}for(const [k]of steps)diag.delete(k);
   }return false;
  }
  if(!place(0))continue;
  for(let fill=0;fill<300;fill++){
   const rows=board.map(row=>row.map(c=>c||String.fromCharCode(65+Math.floor(rng()*26))).join(''));
   if(words.some(w=>occurrences(rows,w).length!==1))continue;
   const result={version:1,size,rows,placements};validate(result,words);return result;
  }
 }
 throw Error('Не удалось создать проверенную сетку. Попробуй ещё раз.');
}
function selected(puzzle,start,end){return puzzle.placements.find(p=>(key(p.start)===key(start)&&key(p.end)===key(end))||(key(p.end)===key(start)&&key(p.start)===key(end)))?.word||null;}
root.WordSearch={generate,validate,occurrences,cells,selected,hash,compatible,pickWords};
})(typeof window==='undefined'?globalThis:window);
