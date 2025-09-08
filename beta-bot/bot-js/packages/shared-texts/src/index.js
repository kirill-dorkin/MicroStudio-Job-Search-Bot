const RU = {
  greet: (first = '') => `Привет${first ? ', ' + first : ''}! Я помогу найти вакансии.`,
  choose_lang: 'Выберите язык / Choose language',
  help: 'Доступные команды: /start /q /sources /region /favorites /saved /export /settings /help',
  menu: 'Используйте /q для быстрого поиска. Пример: /q python loc:Berlin hours:72 remote:yes',
  no_results: 'Ничего не найдено.',
  disclaimer: 'Результаты из внешних источников. Отклик — на сайте источника.',
  more: 'Ещё',
  narrow: 'Сузить',
  fav_added: 'Добавлено в избранное',
  fav_exists: 'Уже в избранном',
  export_ready: 'Экспорт готов',
  settings: ({ lang, role, sources, country }) => `Язык: ${lang}\nРоль: ${role}\nИсточники: ${sources}\nСтрана: ${country}`,
  lang_ru: 'Русский',
  lang_en: 'English',
  role_jobseeker: 'Соискатель',
  role_recruiter: 'Рекрутер',
  notif_on: 'Уведомления включены',
  notif_off: 'Уведомления выключены',
  yes: 'Да',
  no: 'Нет',
  ok: 'OK'
};

const EN = {
  greet: (first = '') => `Hi${first ? ', ' + first : ''}! I will help you find jobs.`,
  choose_lang: 'Choose language / Выберите язык',
  help: 'Commands: /start /q /sources /region /favorites /saved /export /settings /help',
  menu: 'Use /q for quick search. Example: /q python loc:Berlin hours:72 remote:yes',
  no_results: 'No results.',
  disclaimer: 'Results from external sources. Apply on the original site.',
  more: 'More',
  narrow: 'Refine',
  fav_added: 'Added to favorites',
  fav_exists: 'Already in favorites',
  export_ready: 'Export is ready',
  settings: ({ lang, role, sources, country }) => `Lang: ${lang}\nRole: ${role}\nSources: ${sources}\nCountry: ${country}`,
  lang_ru: 'Русский',
  lang_en: 'English',
  role_jobseeker: 'Jobseeker',
  role_recruiter: 'Recruiter',
  notif_on: 'Notifications on',
  notif_off: 'Notifications off',
  yes: 'Yes',
  no: 'No',
  ok: 'OK'
};

export function t(lang, key, params) {
  const dict = lang === 'ru' ? RU : EN;
  const v = dict[key];
  if (typeof v === 'function') return v(params);
  return v || '';
}

export function label(lang, key) {
  const dict = lang === 'ru' ? RU : EN;
  return dict[key] || key;
}
