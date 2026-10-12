/* Прогресс словаря, тренажёра и повторения хранится так же, как ответы уроков и домашка:
   в «конверте» ответов (локально + облако, слияние между устройствами).
   Псевдо-уроки: app-dictionary, app-trainer, app-review. Данные лежат в ключе data.app. */
(function(root){
  const clone = v => JSON.parse(JSON.stringify(v));
  const sid = name => 'app-' + name;
  const bases = {}, owners = {};
  const actor = crypto.randomUUID();
  const owner = () => accountKey('app-owner');
  const strip = o => { const c = { ...o }; delete c.t; return JSON.stringify(c); };
  function peek(name){ try { const d = localLessonEnvelope(sid(name)).data; return (d && d.app) || {}; } catch(e){ return {}; } }
  async function pull(name){
    try { const d = await cloudLoadLessonState(sid(name)); return (d && d.app) || {}; }
    catch(e){ return peek(name); }
  }
  function persist(name, app, base){
    try {
      if (owners[name] !== owner()) throw new Error('Аккаунт изменился. Обнови страницу.');
      persistLessonState(sid(name), { app }, undefined, base ? { app: base } : undefined);
      // The base must describe the caller's last submitted view, not a newer merged cloud view.
      bases[name] = clone(app);
    } catch(e){ setSyncStatus('error', 'Не удалось сохранить: ' + e.message); return false; }
    return true;
  }
  /* Открыть хранилище: подтянуть облако, один раз добавить старые локальные данные (migrate -> {words|items|cfg|hist|log}). */
  async function open(name, migrate){
    const expectedOwner=owner();
    const app = await pull(name);
    if(expectedOwner!==owner())throw new Error('Аккаунт изменился. Обнови страницу.');
    owners[name]=expectedOwner;
    bases[name] = clone(app);
    const marker = accountKey('app-migrated.' + name);
    if (migrate && !localStorage.getItem(marker)) {
      let legacy = null; try { legacy = migrate(); } catch(e){}
      if (legacy) {
        for (const [part, val] of Object.entries(legacy)) {
          if (!val || typeof val !== 'object') continue;
          if (part === 'cfg') { if (!app.cfg) app.cfg = val; continue; }
          const dst = app[part] || (app[part] = {});
          for (const [k, v] of Object.entries(val)) if (!(k in dst)) dst[k] = v;
        }
        if(!persist(name, app, bases[name])) return app;
      }
      try { localStorage.setItem(marker, '1'); } catch(e){}
    }
    if(name==='trainer' && root.TrainerIDs && root.TrainerIDs.migrate(app)) persist(name,app,bases[name]);
    return app;
  }
  /* Сохранить. stampKeys — части, где у каждой записи есть метка времени t (последняя правка побеждает при слиянии). */
  function save(name, app, stampKeys){
    if(owners[name]!==owner()){setSyncStatus('error','Аккаунт изменился. Обнови страницу.');return false;}
    const base = bases[name] || {};
    const now = Date.now();
    for (const part of (stampKeys || [])) {
      const cur = app[part] || {}, b = base[part] || {};
      for (const [k, v] of Object.entries(cur)) {
        const o = b[k] || {};
        const counters = part==='words' ? ['seen','wrong'] : part==='items' ? ['ok','bad'] : [];
        if(counters.length){
          const counts=clone(v.counts || o.counts || {base:Object.fromEntries(counters.map(key=>[key,o[key]||0])),actors:{}});
          const component=counts.actors[actor] || {};
          for(const key of counters){const delta=(v[key]||0)-(o[key]||0);if(delta>0)component[key]=(component[key]||0)+delta;}
          if(Object.keys(component).length)counts.actors[actor]=component;
          v.counts=counts;
        }
        if (!b[k] || strip(o) !== strip(v)) v.t = now;
      }
    }
    return persist(name, app, base);
  }
  root.AppStore = { open, save, peek, pull };
})(window);
