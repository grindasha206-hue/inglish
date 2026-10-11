/* Прогресс словаря, тренажёра и повторения хранится так же, как ответы уроков и домашка:
   в «конверте» ответов (локально + облако, слияние между устройствами).
   Псевдо-уроки: app-dictionary, app-trainer, app-review. Данные лежат в ключе data.app. */
(function(root){
  const clone = v => JSON.parse(JSON.stringify(v));
  const sid = name => 'app-' + name;
  const bases = {};
  const strip = o => { const c = { ...o }; delete c.t; return JSON.stringify(c); };
  function peek(name){ try { const d = localLessonEnvelope(sid(name)).data; return (d && d.app) || {}; } catch(e){ return {}; } }
  async function pull(name){
    try { const d = await cloudLoadLessonState(sid(name)); return (d && d.app) || {}; }
    catch(e){ return peek(name); }
  }
  function persist(name, app, base){
    try {
      persistLessonState(sid(name), { app }, undefined, base ? { app: base } : undefined);
      bases[name] = clone(peek(name));
    } catch(e){ setSyncStatus('error', 'Не удалось сохранить: ' + e.message); }
  }
  /* Открыть хранилище: подтянуть облако, один раз добавить старые локальные данные (migrate -> {words|items|cfg|hist|log}). */
  async function open(name, migrate){
    const app = await pull(name);
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
        persist(name, app, bases[name]);
      }
      try { localStorage.setItem(marker, '1'); } catch(e){}
    }
    return app;
  }
  /* Сохранить. stampKeys — части, где у каждой записи есть метка времени t (последняя правка побеждает при слиянии). */
  function save(name, app, stampKeys){
    const base = bases[name] || {};
    const now = Date.now();
    for (const part of (stampKeys || [])) {
      const cur = app[part] || {}, b = base[part] || {};
      for (const [k, v] of Object.entries(cur)) { const o = b[k]; if (!o || strip(o) !== strip(v)) v.t = now; }
    }
    persist(name, app, base);
  }
  root.AppStore = { open, save, peek, pull };
})(window);
