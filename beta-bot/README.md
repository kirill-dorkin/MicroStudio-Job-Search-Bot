# MicroStudio Job Search Bot

Проект MicroStudio Job Search объединяет Telegram-бота, веб-клиент на Next.js и локальную библиотеку JobSpy для работы с внешними площадками вакансий.

## Состав репозитория
- `bot/` — код Telegram-бота, файлы конфигурации и требования к окружению.
- `jobspy/` — локальная версия библиотеки JobSpy (установится командой `pip install -e .`).
- `web/` — клиент на Next.js/React для просмотра вакансий в браузере.
- `docs/` — вспомогательные материалы (онбординг, FAQ по JobSpy).

## Поддерживаемые версии окружения
- Python 3.10–3.12 (Python 3.13 пока не поддерживается официально, см. раздел «Telegram-бот»).
- Node.js 18+ (для Next.js 14).
- npm 9+/pnpm 8+/bun 1+ — используйте один менеджер пакетов на проект.

## Быстрый старт
Для подробного онбординга и описания рабочих процессов см. [docs/ONBOARDING.md](../docs/ONBOARDING.md).

### Telegram-бот
1. Скопируйте `.env.example` (если есть) или создайте `bot/.env` со значением `TELEGRAM_BOT_TOKEN=...`.
2. Выполните в каталоге `beta-bot`:
   ```bash
   make bot
   ```
   Скрипт создаст виртуальное окружение, установит зависимости из `bot/requirements.txt` и локальную библиотеку JobSpy, после чего запустит `python -m bot.main`.
3. Доступные команды и сценарии описаны в `bot/README_BOT.md`.

### Веб-клиент (Next.js)
1. Перейдите в каталог `web/` и установите зависимости (npm по умолчанию):
   ```bash
   npm install
   ```
2. Запустите дев-сервер:
   ```bash
   npm run dev
   ```
   Приложение будет доступно на `http://localhost:3000`.
3. В файле `web/src/lib/utils/constant.js` задайте собственный API, если требуется.

### Локальная библиотека JobSpy
JobSpy используется ботом, но может применяться отдельно.

```bash
cd beta-bot
pip install -e .
```

После установки можно импортировать `jobspy` в собственных скриптах для работы с API площадок вакансий. Дополнительные сведения и FAQ вынесены в [docs/JOBSPY_REFERENCE.md](../docs/JOBSPY_REFERENCE.md).

## Полезные команды
- `make venv` — создать виртуальное окружение (Python 3.10–3.12).
- `make install` — установить зависимости бота и JobSpy в `.venv`.
- `make run` — запустить бота, подхватывая переменные окружения из `.env` и `bot/.env`.
- `make clean` — удалить виртуальное окружение.

## Тестирование и CI
- Юнит-тесты для Python располагаются в `beta-bot/tests`. Запуск: `pytest` из каталога `beta-bot`.
- Конфигурация GitHub Actions в `.github/workflows/ci.yml` автоматически прогоняет pytest и ESLint при пуше.

## Дополнительные материалы
- [docs/ONBOARDING.md](../docs/ONBOARDING.md) — структурированное руководство по запуску всех компонентов.
- [docs/JOBSPY_REFERENCE.md](../docs/JOBSPY_REFERENCE.md) — FAQ JobSpy, схемы данных и ответы на частые вопросы.
- [bot/README_BOT.md](bot/README_BOT.md) — справка по Telegram-боту.
- [web/README.md](../web/README.md) (если потребуется) — заметки по фронтенду.

