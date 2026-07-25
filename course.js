/* ============================================================
   КУРС — единственный файл, который нужно редактировать,
   когда добавляешь новый урок.

   Как добавить урок:
   1. Положи HTML-файл урока в папку lessons/
   2. Добавь строчку в нужный модуль ниже:
      { id:"unit-04", unit:4, title:"Название", file:"lessons/имя-файла.html" }
   id должен быть уникальным — по нему хранится прогресс.
   ============================================================ */

const COURSE = {
  title: "Essential Grammar in Use",
  subtitle: "Уровень A1–A2 · интерактивные уроки",
  modules: [
    {
      title: "Модуль 1 · To be и настоящее время",
      lessons: [
        {
          id: "unit-01",
          unit: 1,
          title: "am / is / are",
          description: "Глагол to be: утверждение и отрицание",
          file: "lessons/unit-01-am-is-are.html"
        },
        {
          id: "unit-03",
          unit: 3,
          title: "I am doing — Present Continuous",
          description: "Что происходит прямо сейчас",
          file: "lessons/unit-03-present-continuous.html"
        }
      ]
    }
  ]
};

/* Плоский список уроков по порядку */
const ALL_LESSONS = COURSE.modules.flatMap(m => m.lessons);

function lessonById(id){ return ALL_LESSONS.find(l => l.id === id) || null; }
function lessonAfter(id){
  const i = ALL_LESSONS.findIndex(l => l.id === id);
  return (i >= 0 && i < ALL_LESSONS.length - 1) ? ALL_LESSONS[i + 1] : null;
}
