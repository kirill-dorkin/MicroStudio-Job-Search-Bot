from __future__ import annotations

# Minimal RU/EN text set. RU — основной.


def t(lang: str, key: str, **kwargs) -> str:
    lang = (lang or "ru").lower()
    value = (TEXTS.get(lang) or TEXTS["ru"]).get(key) or TEXTS["ru"].get(key) or key
    try:
        return value.format(**kwargs)
    except Exception:
        return value


TEXTS = {
    "ru": {
        # Onboarding / common
        "greet": "{first_name}, здравствуйте! Я MicroStudio Job Search Bot. Разработано студией MicroStudio. Подберу вакансии с популярных сайтов. Отклик — на сайте-источнике.",
        "choose_lang": "Выберите язык интерфейса.",
        "role_q": "Кем вы являетесь?",
        "role_jobseeker": "Соискатель",
        "role_recruiter": "Рекрутер/HR",
        "consent": "Мы используем ваши данные, чтобы сохранять запросы и показывать подборки. Подробнее — в Политике.",
        "notifications_q": "Присылать подборки и обновления (до 1–2 в день)? Нажмите кнопку ниже или ответьте 'да/нет'.",
        "done_onboarding": "Готово! Можно начать поиск.",

        # Menu / commands
        "menu": "Доступные команды:\n/start — онбординг\n/search — поиск\n/q — быстрый поиск\n/sources — источники\n/region — регион Indeed/Glassdoor\n/region_list — список стран\n/currency — базовая валюта\n/suggest — подсказки по ключевым\n/saved — сохранённые запросы\n/favorites — избранное\n/subs — подписки\n/summary — сводка\n/export — экспорт CSV\n/previews — веб-превью ссылок\n/settings — настройки\n/help — помощь",
        "help": "Я собираю вакансии из LinkedIn, Indeed, Google Jobs и других. Разработано студией MicroStudio. Отклик — на стороне источника. Для поиска используйте /search.",

        # Sources / region
        "sources_title": "Из каких источников искать?",
        "sources_hint": "Подсказка: фильтры у источников отличаются. Я упрощу запрос при несовместимости.",
        "region_title": "Страна для Indeed/Glassdoor (country_indeed):",
        "region_saved": "Страна сохранена: {country}",

        # Search flow
        "search_intro": "Пошаговый поиск. Можно пропускать шаги.",
        "q_keywords": "Ключевые слова? (например: Python developer)",
        "q_location": "Локация? (город/регион; оставьте пустым — везде)",
        "q_jobtype": "Тип занятости?",
        "q_remote": "Удалённая работа?",
        "q_hours": "За какой период публикации смотреть?",
        "confirm_filters": "Проверьте параметры поиска:",
        "search_running": "Ищу вакансии…",
        "no_results": "Ничего не нашли. Уточните запрос или снимите фильтры.",
        "source_limited": "Источник {site} ограничил выдачу. Пробуем остальные.",
        "result_header": "Нашёл {count} вакансий. Показать: страница {page}/{pages}.",
        "refine_title": "Уточнить фильтры или сортировку:",

        # Cards / actions
        "card_title": "{title} — {company} • {location}",
        "card_meta": "Источник: {site} • Опубликовано: {date_posted}",
        "card_type": "Формат: {remote} • Тип: {job_type}",
        "card_salary": "Зарплата: {salary}",
        "card_link": "Ссылка: {url}",
        "open_on_site": "Отклик на сайте-источнике. Открыть?",
        "added_fav": "Добавлено в избранное.",
        "already_fav": "Уже в избранном.",

        # Saved searches / favorites / subs
        "save_search_q": "Сохранить текущий поиск как ‘{name}’?",
        "search_saved": "Запрос сохранён.",
        "saved_list": "Сохранённые запросы:",
        "no_saved": "Сохранённых запросов нет.",
        "favorites_list": "Избранное: {n} элементов.",
        "no_favorites": "Избранное пусто.",
        "subs_title": "Подписка на новые вакансии по сохранённым запросам. Выберите частоту.",
        "subs_saved": "Подписка обновлена: {freq}.",
        "sort_updated": "Сортировка применена: {mode}.",
        "salary_updated": "Минимальная зарплата: {amount}",
        "salary_any": "Зарплата: любая",

        # Settings
        "settings": "Настройки:\nЯзык: {lang}\nРоль: {role}\nИсточники: {sources}\nСтрана Indeed/Glassdoor: {country}",
        "previews_status": "Веб-превью: {status} (в карточках вакансий)",
        "base_currency": "Базовая валюта: {currency}",
        "choose_currency": "Выберите базовую валюту для сортировки/сводки:",
        "currency_saved": "Базовая валюта сохранена: {currency}",
        "muted_added": "Компания скрыта: {company}",
        "muted_list": "Скрытые компании: {list}",
        "muted_cleared": "Список скрытых компаний очищен.",
        "unmuted": "Компания возвращена: {company}",
        "no_muted": "Скрытых компаний нет.",
        "choose_companies": "Выберите компании для фильтра (только выбранные):",
        "companies_cleared": "Фильтр по компаниям очищен.",
        "no_companies": "Нет компаний",
        "company_added": "Добавлена компания: {name}",

        # Disclaimers / errors
        "disclaimer": "Вакансии из внешних источников. Актуальность и отклик — на стороне источника. Разработано MicroStudio (Powered by JobSpy).",
        "err_long": "Слишком длинный ввод. Уложитесь в {n} символов.",
        "err": "На нашей стороне ошибка. Уже чиним. Попробуйте позже.",
        "fx_refresh_failed": "Не удалось обновить курсы валют: {error}",

        # Marketing / About
        "about_title": "MicroStudio Job Search — ваш быстрый путь к подходящим вакансиям",
        "about_body": (
            "Разработано студией MicroStudio. Основано на библиотеке JobSpy.\n\n"
            "Что умею:\n"
            "- Ищу по LinkedIn, Indeed, Google Jobs, ZipRecruiter, Glassdoor и др.\n"
            "- Фильтры: ключевые слова, локация, удалёнка, период, тип занятости.\n"
            "- Сохранённые запросы и подписки на новые вакансии.\n"
            "- Избранное и экспорт в CSV для удобной работы.\n"
            "- Простой интерфейс: 1–2 шага на экран.\n\n"
            "Важно:\n"
            "- Вакансии собираются с внешних сайтов. Отклик — на стороне источника.\n"
            "- Приватность: храним только ваши настройки, запросы и избранное."
        ),
        "about_cta": "Попробовать поиск сейчас?",

        # Tour (feature tour)
        "tour_1": "Все вакансии в одном месте: LinkedIn, Indeed, Google Jobs и другие. Экономия времени и больше релевантных вариантов.",
        "tour_2": "Гибкие фильтры: ключевые слова, локация, удалёнка, период публикации и тип занятости.",
        "tour_3": "Сохранённые запросы: вернитесь к поиску в один клик и не собирайте фильтры заново.",
        "tour_4": "Подписки: получайте новые вакансии по вашим запросам. Без спама — вы управляете частотой.",
        "tour_5": "Избранное и экспорт CSV: собирайте интересные позиции и выгружайте для сравнения или отчёта.",
        "tour_6": "Прозрачность: у каждой карточки — ссылка на оригинал. Отклик там же, где размещена вакансия.",
        "tour_done": "Готовы? Запустите /search и получите первую подборку.",

        # Summary
        "summary_no_data": "Нет данных для сводки. Сначала выполните /search.",
        "summary_title": "Рыночная сводка по последним результатам:",
        "summary_footer": "Подсказка: указывайте фильтры точнее — сводка станет полезнее.",
        # Tips / misc
        "overview_q": "Короткий обзор возможностей?",
        "tip_summary": "Подсказка: попробуйте /summary для сводки рынка по последней выдаче.",
        "indeed_hint": "Подсказка: на Indeed нельзя одновременно использовать период и тип/удалёнку. Результатов может быть меньше.",
        "q_format": "Формат: /q python loc:Berlin remote:yes hours:72 type:fulltime",
        "location_any": "Локация: везде",
        "suggest_keywords": "Подсказки по ключевым словам:",
        "added_term": "Добавил: {term}",
        "digest_header": "Новые вакансии по вашим подпискам:",
        "digest_for": "Подборка по: {name}",
        "updated": "Обновлено",
        "cta_tips": "Попробуйте сохранить поиск, включить подписку, настроить источники или экспортировать результаты.",
        "deleted_short": "Удалено",
        "showing_similar": "Показываю похожие…",
        # Summary line labels
        "summary_total_jobs": "Всего вакансий: {n}",
        "summary_top_sources": "Топ источники: {sources}",
        "summary_top_locations": "Топ локации: {locations}",
        "summary_bands_by_currency": "Зарплатные коридоры по валютам: {bands}",
        "summary_band_in_base": "Коридор в базе ({base}): {band}",
        "summary_top_keywords": "Топ ключевых: {keywords}",
    },
    "en": {
        "greet": "Hi {first_name}! I’m MicroStudio Job Search Bot by MicroStudio. I search jobs from popular sites. Applications happen on the source website.",
        "choose_lang": "Choose your language.",
        "role_q": "Who are you?",
        "role_jobseeker": "Job seeker",
        "role_recruiter": "Recruiter/HR",
        "consent": "We use your data to save searches and deliver digests. See Policy.",
        "notifications_q": "Send digests and updates (1–2/day)? Press a button below or type 'yes/no'.",
        "done_onboarding": "All set! You can start searching.",
        "menu": "Commands: /start /search /q /sources /region /region_list /currency /suggest /saved /favorites /subs /summary /export /previews /settings /help",
        "help": "I aggregate jobs from LinkedIn, Indeed, Google Jobs and others. Built by MicroStudio. Use /search to find.",
        "sources_title": "Which sources to search?",
        "sources_hint": "Filters differ across sources. I’ll simplify if needed.",
        "region_title": "Country for Indeed/Glassdoor (country_indeed):",
        "region_saved": "Country saved: {country}",
        "search_intro": "Guided search. You can skip steps.",
        "q_keywords": "Keywords? (e.g.: Python developer)",
        "q_location": "Location? (city/region; empty — anywhere)",
        "q_jobtype": "Job type?",
        "q_remote": "Remote work?",
        "q_hours": "How far back to look?",
        "confirm_filters": "Confirm your search parameters:",
        "search_running": "Searching…",
        "no_results": "No results. Adjust your query or relax filters.",
        "source_limited": "{site} limited results. Trying the rest.",
        "result_header": "Found {count} jobs. Page {page}/{pages}.",
        "refine_title": "Refine filters or sorting:",
        "card_title": "{title} — {company} • {location}",
        "card_meta": "Source: {site} • Posted: {date_posted}",
        "card_type": "Mode: {remote} • Type: {job_type}",
        "card_salary": "Salary: {salary}",
        "card_link": "Link: {url}",
        "open_on_site": "Apply on the source website. Open?",
        "added_fav": "Added to favorites.",
        "already_fav": "Already in favorites.",
        "save_search_q": "Save current search as ‘{name}’?",
        "search_saved": "Search saved.",
        "saved_list": "Saved searches:",
        "no_saved": "No saved searches.",
        "favorites_list": "Favorites: {n} items.",
        "no_favorites": "No favorites yet.",
        "subs_title": "Subscriptions for saved searches. Choose frequency.",
        "subs_saved": "Subscription updated: {freq}.",
        "sort_updated": "Sorting applied: {mode}.",
        "salary_updated": "Minimum salary: {amount}",
        "salary_any": "Salary: any",
        "settings": "Settings:\nLang: {lang}\nRole: {role}\nSources: {sources}\nIndeed/Glassdoor country: {country}",
        "previews_status": "Web previews: {status} (in job cards)",
        "base_currency": "Base currency: {currency}",
        "choose_currency": "Choose base currency for sorting/summary:",
        "currency_saved": "Base currency saved: {currency}",
        "muted_added": "Company muted: {company}",
        "muted_list": "Muted companies: {list}",
        "muted_cleared": "Muted companies cleared.",
        "unmuted": "Company unmuted: {company}",
        "no_muted": "No muted companies.",
        "choose_companies": "Pick companies to include (filter):",
        "companies_cleared": "Company include filter cleared.",
        "no_companies": "No companies",
        "company_added": "Added company: {name}",
        "disclaimer": "Jobs come from external sources. Apply on the source site. Built by MicroStudio (Powered by JobSpy).",
        "err_long": "Input too long. Limit {n} chars.",
        "err": "Server error. Please try again later.",
        "fx_refresh_failed": "Could not refresh currency rates: {error}",

        # Marketing / About
        "about_title": "MicroStudio Job Search — your fast track to relevant jobs",
        "about_body": (
            "Developed by MicroStudio. Powered by the JobSpy library.\n\n"
            "What I do:\n"
            "- Search across LinkedIn, Indeed, Google Jobs, ZipRecruiter, Glassdoor & more.\n"
            "- Filters: keywords, location, remote, posted time, job type.\n"
            "- Saved searches and subscriptions for new jobs.\n"
            "- Favorites and CSV export for easy workflows.\n"
            "- Clear UI: 1–2 steps per screen.\n\n"
            "Important:\n"
            "- Jobs come from external sources. Apply on the source website.\n"
            "- Privacy: we store only your settings, saved searches and favorites."
        ),
        "about_cta": "Try a search now?",

        # Tour
        "tour_1": "All your jobs in one place: LinkedIn, Indeed, Google Jobs and more.",
        "tour_2": "Flexible filters: keywords, location, remote, posted time and job type.",
        "tour_3": "Saved searches: one‑click return to your favorite queries.",
        "tour_4": "Subscriptions: get new jobs on your terms. No spam.",
        "tour_5": "Favorites and CSV export: collect and compare with ease.",
        "tour_6": "Transparency: each card links to the original post for applying.",
        "tour_done": "Ready? Run /search to get your first results.",

        # Summary
        "summary_no_data": "No data to summarize. Run /search first.",
        "summary_title": "Market summary for your last results:",
        "summary_footer": "Tip: refine your filters for more useful insights.",
        # Tips / misc
        "overview_q": "Quick feature overview?",
        "tip_summary": "Tip: try /summary for a market overview of your last results.",
        "indeed_hint": "Hint: Indeed doesn’t allow combining posted time with job type/remote. Results may be fewer.",
        "q_format": "Format: /q python loc:Berlin remote:yes hours:72 type:fulltime",
        "location_any": "Location: anywhere",
        "suggest_keywords": "Suggested keywords:",
        "added_term": "Added: {term}",
        "digest_header": "New jobs for your subscriptions:",
        "digest_for": "Digest for: {name}",
        "updated": "Updated",
        "cta_tips": "Try saving the search, enabling subscriptions, adjusting sources, or exporting results.",
        "deleted_short": "Deleted",
        "showing_similar": "Showing similar…",
        # Summary line labels
        "summary_total_jobs": "Total jobs: {n}",
        "summary_top_sources": "Top sources: {sources}",
        "summary_top_locations": "Top locations: {locations}",
        "summary_bands_by_currency": "Salary bands by currency: {bands}",
        "summary_band_in_base": "Band in base ({base}): {band}",
        "summary_top_keywords": "Top keywords: {keywords}",
    },
}


# Common UI labels for keyboards
LABELS = {
    "ru": {
        "lang_ru": "Русский",
        "lang_en": "English",
        "ok": "Готово",
        "back": "Назад",
        "cancel": "Отмена",
        "yes": "Да",
        "no": "Нет",
        "more": "Ещё",
        "narrow": "Сузить фильтры",
        "open": "Открыть на сайте",
        "details": "Подробнее",
        "fav": "В избранное",
        "similar": "Похожие",
        "share": "Поделиться",
        "mute_company": "Скрыть компанию",
        "save_search": "Сохранить запрос",
        "examples": "Примеры",
        "skip": "Пропустить",
        "next": "Далее",
        "close": "Закрыть",
        "try_now": "Попробовать /search",
        "about": "О боте",
        "tour": "Тур",
        # Hours shortcuts
        "h_24": "24ч",
        "h_72": "72ч",
        "h_168": "7д",
        "any": "Любая",
        # Remote/type/sort prefixes
        "remote_prefix": "Удалёнка",
        "type_prefix": "Тип",
        "sort_prefix": "Сортировать",
        "salary_prefix": "Мин. зарплата",
        "currency_prefix": "Валюта",
        "distance_prefix": "Дистанция",
        "sources_prefix": "Источники",
        "companies": "Компании",
        # Job types
        "jt_fulltime": "Полная",
        "jt_parttime": "Частичная",
        "jt_contract": "Контракт",
        "jt_internship": "Стажировка",
        # Actions for saved searches / subs
        "run": "Искать",
        "delete": "Удалить",
        "freq_label": "Частота",
        "off": "Off",
        "daily": "Daily",
        "weekly": "Weekly",
        "every_3d": "3д",
        "pause": "Пауза",
        "resume": "Возобновить",
        "send_now": "Прислать сейчас",
        # Remote values
        "remote_yes": "Удалённо",
        "remote_no": "Офис/Гибрид",
        "on": "включены",
        "off_state": "выключены",
    },
    "en": {
        "lang_ru": "Русский",
        "lang_en": "English",
        "ok": "Done",
        "back": "Back",
        "cancel": "Cancel",
        "yes": "Yes",
        "no": "No",
        "more": "More",
        "narrow": "Refine",
        "open": "Open",
        "details": "Details",
        "fav": "Favorite",
        "similar": "Similar",
        "share": "Share",
        "mute_company": "Mute company",
        "save_search": "Save search",
        "examples": "Examples",
        "skip": "Skip",
        "next": "Next",
        "close": "Close",
        "try_now": "Try /search",
        "about": "About",
        "tour": "Tour",
        # Hours shortcuts
        "h_24": "24h",
        "h_72": "72h",
        "h_168": "7d",
        "any": "Any",
        # Remote/type/sort prefixes
        "remote_prefix": "Remote",
        "type_prefix": "Type",
        "sort_prefix": "Sort",
        "salary_prefix": "Min salary",
        "currency_prefix": "Currency",
        "distance_prefix": "Distance",
        "sources_prefix": "Sources",
        "companies": "Companies",
        # Job types
        "jt_fulltime": "Full-time",
        "jt_parttime": "Part-time",
        "jt_contract": "Contract",
        "jt_internship": "Internship",
        # Actions for saved searches / subs
        "run": "Search",
        "delete": "Delete",
        "freq_label": "Freq",
        "off": "Off",
        "daily": "Daily",
        "weekly": "Weekly",
        "every_3d": "3d",
        "pause": "Pause",
        "resume": "Resume",
        "send_now": "Send now",
        # Remote values
        "remote_yes": "Remote",
        "remote_no": "Office/Hybrid",
        "on": "on",
        "off_state": "off",
    },
}


def label(lang: str, key: str) -> str:
    return (LABELS.get((lang or "ru").lower()) or LABELS["ru"]).get(key) or key

# ---- Extra keys appended to avoid conflicts in inline patches ----
EXTRA_TEXTS = {
    "ru": {
        "help_q": "Быстрый поиск: /q python loc:Berlin remote:yes hours:72 type:fulltime",
        "region_list_title": "Доступные страны для Indeed/Glassdoor (пример ввода в /region):",
        "favorites_cleared": "Избранное очищено.",
        "confirm_delete": "Удалить все ваши данные (настройки, избранное, сохранённые запросы)?",
        "deleted": "Ваши данные удалены.",
        "export_ready": "Экспорт ваших данных (JSON) готов.",
    },
    "en": {
        "help_q": "Quick search: /q python loc:Berlin remote:yes hours:72 type:fulltime",
        "region_list_title": "Available countries for Indeed/Glassdoor (example input for /region):",
        "favorites_cleared": "Favorites cleared.",
        "confirm_delete": "Delete all your data (settings, favorites, saved searches)?",
        "deleted": "Your data has been deleted.",
        "export_ready": "Your data export (JSON) is ready.",
    },
}

for _lng, _vals in EXTRA_TEXTS.items():
    if _lng in TEXTS:
        TEXTS[_lng].update(_vals)

EXTRA_LABELS = {
    "ru": {"all": "Выбрать все", "none": "Очистить"},
    "en": {"all": "Select all", "none": "Clear all"},
}

for _lng, _vals in EXTRA_LABELS.items():
    if _lng in LABELS:
        LABELS[_lng].update(_vals)
