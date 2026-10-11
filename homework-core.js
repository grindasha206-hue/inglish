/* Домашка: общее состояние лежит в ответах урока (data.homework = {on, c:[0/1/null…], t:{"1":"текст"}}).
   Его читают и пишут сам урок (через плеер) и раздел «Домашка» — это одно и то же хранилище. */
(function(root){
  const DEFAULT_TASKS = 5;
  function summary(data, tasks){
    const hw = (data && data.homework) || {};
    const c = Array.isArray(hw.c) ? hw.c : [];
    const total = tasks || c.length || DEFAULT_TASKS;
    let done = 0; for (let i = 0; i < total; i++) if (c[i] === 1) done++;
    return { on: !!hw.on, done, total, complete: done >= total, started: done > 0 || Object.values(hw.t || {}).some(Boolean) };
  }
  function localData(id){ try { return localLessonEnvelope(id).data; } catch(e){ return null; } }
  root.HW = { summary, localData, DEFAULT_TASKS };
})(window);
