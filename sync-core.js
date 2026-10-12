/* Pure validation and merge helpers. No network or browser state. */
(function(root){
  const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const safeId = v => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,119}$/.test(v);
  const number = v => Number.isSafeInteger(v) && v >= 0 && v <= 1000000000;
  const clone = v => JSON.parse(JSON.stringify(v));
  function validateProgress(raw){
    if (!plain(raw) || !plain(raw.lessons) || !plain(raw.activity) || !number(raw.xp)) throw new Error('Некорректный формат прогресса');
    if (Object.keys(raw.lessons).length > 5000 || Object.keys(raw.activity).length > 20000) throw new Error('Слишком большой файл прогресса');
    const lessons = {};
    for (const [id, value] of Object.entries(raw.lessons)) {
      if (!safeId(id) || !plain(value) || !['started','done'].includes(value.status)) throw new Error('Некорректный урок');
      const item = { status:value.status };
      for (const key of ['bestScore','maxScore','awardedXP']) if (value[key] !== undefined) {
        if (!number(value[key])) throw new Error('Некорректный результат'); item[key] = value[key];
      }
      if (value.completedAt !== undefined) {
        if (typeof value.completedAt !== 'string' || value.completedAt.length > 40 || !Number.isFinite(Date.parse(value.completedAt))) throw new Error('Некорректная дата');
        item.completedAt = value.completedAt;
      }
      if (item.status === 'done' && item.awardedXP === undefined) item.awardedXP = 50 + (item.bestScore || 0);
      lessons[id] = item;
    }
    const activity = {};
    for (const [day, value] of Object.entries(raw.activity)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || value !== true || new Date(day+'T00:00:00Z').toISOString().slice(0,10) !== day) throw new Error('Некорректный день активности');
      activity[day] = true;
    }
    const earned = Object.values(lessons).reduce((n,l)=>n+(l.status === 'done' ? l.awardedXP : 0),0);
    // Preserve historical extra XP without counting it a second time on every merge.
    const xpBonus = raw.xpBonus === undefined ? Math.max(0, raw.xp-earned) : raw.xpBonus;
    if (!number(xpBonus)) throw new Error('Некорректные XP');
    return { schemaVersion:2, lessons, activity, xp:earned+xpBonus, xpBonus, updatedAt:Number.isSafeInteger(raw.updatedAt) && raw.updatedAt>=0 ? raw.updatedAt : 0 };
  }
  function emptyProgress(){ return validateProgress({lessons:{},xp:0,activity:{}}); }
  function mergeProgress(a,b){
    a=validateProgress(a); b=validateProgress(b);
    const lessons={...a.lessons};
    for (const [id,right] of Object.entries(b.lessons)) {
      const left=lessons[id];
      if (!left) { lessons[id]=right; continue; }
      const completed=[left.completedAt,right.completedAt].filter(Boolean).sort();
      lessons[id]={ status:left.status==='done'||right.status==='done'?'done':'started',
        bestScore:Math.max(left.bestScore||0,right.bestScore||0), maxScore:Math.max(left.maxScore||0,right.maxScore||0),
        awardedXP:Math.max(left.awardedXP||0,right.awardedXP||0), ...(completed.length?{completedAt:completed[0]}:{}) };
    }
    return validateProgress({lessons,activity:{...a.activity,...b.activity},xp:0,xpBonus:Math.max(a.xpBonus,b.xpBonus),updatedAt:Math.max(a.updatedAt,b.updatedAt)});
  }
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  // Three-way merge: independent edits survive. Conflicts retain the cloud value;
  // callers keep a separate, downloadable copy of local conflicting answers.
  // Each page contributes an independent, monotonically increasing counter component.
  // Re-sending the same component is idempotent; components from two pages are added.
  function mergeAppItem(base,local,remote,path){
    const keys=path.startsWith('/app/words/')?['seen','wrong']:['ok','bad'];
    const counter=v=>plain(v.counts)?v.counts:{base:Object.fromEntries(keys.map(k=>[k,v[k]||0])),actors:{}};
    const lc=counter(local),rc=counter(remote),counts={base:{},actors:{}};
    for(const key of keys)counts.base[key]=Math.max(lc.base?.[key]||0,rc.base?.[key]||0);
    for(const id of new Set([...Object.keys(lc.actors||{}),...Object.keys(rc.actors||{})])){
      if(['__proto__','constructor','prototype'].includes(id))continue;
      counts.actors[id]=Object.fromEntries(keys.map(k=>[k,Math.max(lc.actors?.[id]?.[k]||0,rc.actors?.[id]?.[k]||0)]));
    }
    const later=(local.t||0)===(remote.t||0)?(JSON.stringify(local)>JSON.stringify(remote)?local:remote):((local.t||0)>(remote.t||0)?local:remote);
    const schedule=v=>[v?.box,v?.due,v?.last];
    const scheduled=equal(schedule(local),schedule(base))?remote:equal(schedule(remote),schedule(base))?local:later;
    const out={};
    for(const key of new Set([...Object.keys(local),...Object.keys(remote)])){
      if(keys.includes(key)||key==='counts'||['__proto__','constructor','prototype'].includes(key))continue;
      // Schedule fields form one unit; other fields (e.g. the star) merge independently.
      if(['box','due','last'].includes(key))out[key]=scheduled[key];
      else if(key==='t')out[key]=Math.max(local.t||0,remote.t||0);
      else if(equal(local[key],base?.[key]))out[key]=remote[key];
      else if(equal(remote[key],base?.[key])||equal(local[key],remote[key]))out[key]=local[key];
      else out[key]=later[key];
      if(out[key]===undefined)delete out[key];
    }
    out.counts=counts;
    for(const key of keys)out[key]=counts.base[key]+Object.values(counts.actors).reduce((sum,v)=>sum+(v[key]||0),0);
    return out;
  }
  function mergeAnswers(base,local,remote,path='',conflicts=[]){
    if ((path==='/memo'||path==='/match'||/^\/roundMatches\/[^/]+$/.test(path)) && Array.isArray(local)&&Array.isArray(remote)) return {data:[...new Set([...local,...remote])].sort(),conflicts};
    if (/^\/app\/(words|items)\/[^/]+$/.test(path)&&plain(local)&&plain(remote)&&(local.counts||remote.counts))return {data:mergeAppItem(base,local,remote,path),conflicts};
    if (equal(local,base)) return {data:remote,conflicts};
    if (equal(remote,base) || equal(local,remote)) return {data:local,conflicts};
    // Per-item progress of dictionary/trainer: if both sides changed the same item, the later edit (field t) wins without a conflict.
    if (/^\/app\/(words|items)\/[^/]+$|^\/app\/cfg$/.test(path) && plain(local) && plain(remote)) return {data:(local.t||0)>(remote.t||0)?local:remote,conflicts};
    if ((plain(local)&&plain(remote)&&(plain(base)||base===undefined)) ||
        (Array.isArray(local)&&Array.isArray(remote)&&(Array.isArray(base)||base===undefined))) {
      const data=Array.isArray(local)?[]:{};
      for (const key of new Set([...Object.keys(base||{}),...Object.keys(local),...Object.keys(remote)])) {
        if (['__proto__','constructor','prototype'].includes(key)) continue;
        const merged=mergeAnswers(base?.[key],local[key],remote[key],path+'/'+key,conflicts);
        if (merged.data !== undefined) data[key]=merged.data;
      }
      return {data,conflicts};
    }
    conflicts.push(path); return {data:remote,conflicts};
  }
  root.SyncCore={plain,safeId,clone,validateProgress,emptyProgress,mergeProgress,mergeAnswers,mergeAppItem,equal};
})(typeof window !== 'undefined' ? window : globalThis);
