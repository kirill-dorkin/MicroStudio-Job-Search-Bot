MicroStudio Job Search Bot
==========================

MicroStudio Job Search — Telegram‑бот для поиска вакансий с популярных сайтов. Основан на open‑source библиотеке JobSpy.

Возможности
- Поиск по LinkedIn, Indeed, Google Jobs, ZipRecruiter, Glassdoor и др.
- Пошаговый сценарий и быстрый поиск одной строкой (`/q`).
- Сохранённые запросы, избранное, подписки на дайджесты (daily/3d/weekly).
- Экспорт результатов в CSV, краткая сводка рынка (`/summary`).
- Интерфейс RU/EN.

Быстрый старт
1) Укажите токен бота в `bot/.env`:
   `TELEGRAM_BOT_TOKEN=123456:ABC...`
2) Запустите бот:
   `make bot`

Команды
- `/start` — онбординг и выбор языка
- `/search` — пошаговый поиск
- `/q` — быстрый поиск одной строкой
- `/sources` — источники вакансий
- `/region` и `/region_list` — регион для Indeed/Glassdoor
- `/favorites`, `/favorites_clear` — избранное
- `/saved`, `/subs` — сохранённые запросы и подписки
- `/export` — экспорт CSV; `/summary` — рыночная сводка
- `/settings`, `/about`, `/tour`, `/help`

Структура
- `bot/` — код бота и документация (`bot/README_BOT.md`)

Лицензия
См. файл `LICENSE`.

This searches the description/title and must include software, summer, 2025, one of the languages, engineering intern exactly, no tax, no marketing.

---

**Q: No results when using "google"?**  
**A:** You have to use super specific syntax. Search for google jobs on your browser and then whatever pops up in the google jobs search box after applying some filters is what you need to copy & paste into the google_search_term. 

---

**Q: Received a response code 429?**  
**A:** This indicates that you have been blocked by the job board site for sending too many requests. All of the job board sites are aggressive with blocking. We recommend:

- Wait some time between scrapes (site-dependent).
- Try using the proxies param to change your IP address.

---

### JobPost Schema

```plaintext
JobPost
├── title
├── company
├── company_url
├── job_url
├── location
│   ├── country
│   ├── city
│   ├── state
├── is_remote
├── description
├── job_type: fulltime, parttime, internship, contract
├── job_function
│   ├── interval: yearly, monthly, weekly, daily, hourly
│   ├── min_amount
│   ├── max_amount
│   ├── currency
│   └── salary_source: direct_data, description (parsed from posting)
├── date_posted
└── emails

Linkedin specific
└── job_level

Linkedin & Indeed specific
└── company_industry

Indeed specific
├── company_country
├── company_addresses
├── company_employees_label
├── company_revenue_label
├── company_description
└── company_logo

Naukri specific
├── skills
├── experience_range
├── company_rating
├── company_reviews_count
├── vacancy_count
└── work_from_home_type
```
