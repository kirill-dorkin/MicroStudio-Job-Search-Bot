# Онбординг MicroStudio Job Search

Документ описывает запуск и разработку всех компонентов репозитория: Telegram-бота, локальной библиотеки JobSpy и веб-клиента на Next.js.

## 1. Telegram-бот
### Требования
- Python 3.10–3.12.
- Установленный `make` (по желанию) и возможность создавать виртуальные окружения (`venv`).
- Токен Telegram-бота от BotFather.

### Структура
- `beta-bot/bot/` — код и ресурсы бота.
- `beta-bot/jobspy/` — локальная библиотека парсеров вакансий.
- `beta-bot/Makefile` — сценарии установки/запуска.

### Настройка окружения
1. Создайте файл `beta-bot/bot/.env`:
   ```bash
   TELEGRAM_BOT_TOKEN=123456:ABC...
   ```
2. Перейдите в каталог `beta-bot` и выполните `make bot`. Команда:
   - создаёт `.venv` с Python 3.10–3.12;
   - устанавливает зависимости из `bot/requirements.txt` и локальную библиотеку JobSpy (`pip install -e .`);
   - подхватывает переменные окружения из `.env` и `bot/.env`;
   - запускает `python -m bot.main`.

> **Важно:** при попытке запуска на Python 3.13 скрипт завершится с предупреждением. Обновите зависимости либо используйте поддерживаемую версию Python.

### Ручной запуск
```bash
cd beta-bot
python -m venv .venv
source .venv/bin/activate
pip install -r bot/requirements.txt
pip install -e .
export TELEGRAM_BOT_TOKEN="123456:ABC..."
python -m bot.main
```

### Что почитать
- `bot/README_BOT.md` — сценарии общения и список команд.
- `bot/texts.py` — локализация.
- `bot/jobs.py` — работа с библиотекой JobSpy.
- `bot/storage.py` — файловое хранилище пользователей (с блокировкой и резервными копиями).

## 2. Локальная библиотека JobSpy
### Назначение
Содержит адаптированную для проекта версию [JobSpy](https://github.com/cullenwatson/JobSpy). Используется ботом, но может подключаться в сторонние сервисы.

### Установка отдельно
```bash
cd beta-bot
pip install -e .
```

После установки можно импортировать:
```python
from jobspy import scrape_jobs
```

Дополнительные материалы и FAQ см. в [docs/JOBSPY_REFERENCE.md](JOBSPY_REFERENCE.md).

## 3. Веб-клиент (Next.js)
### Требования
- Node.js 18 или 20.
- npm 9+ (или pnpm/bun при согласованном использовании).

### Настройка
1. Перейдите в каталог `web/` и установите зависимости:
   ```bash
   npm install
   ```
   Будет создан `package-lock.json`, синхронизированный с `package.json`.
2. Запуск дев-сервера:
   ```bash
   npm run dev
   ```
   Приложение доступно на `http://localhost:3000`.
3. Сборка и запуск прод-версии:
   ```bash
   npm run build
   npm start
   ```

### Конфигурация
- `web/src/lib/utils/constant.js` — базовый URL API вакансий и параметры пагинации.
- `web/src/lib/api/` — функции обращения к API с кешированием и обработкой ошибок.
- `web/src/pages/` — страницы Next.js (используется Pages Router, совместимый с Next 14).

### Проверка качества
- ESLint: `npm run lint`.
- Для скриншотов и визуальных тестов используйте локальный дев-сервер.

## 4. Тесты и CI
- Python-тесты находятся в `beta-bot/tests`. Запускайте `pytest` из каталога `beta-bot`.
- GitHub Actions (`.github/workflows/ci.yml`) прогоняет pytest и ESLint при каждом пуше/PR.
- Для локальной проверки CI выполните:
  ```bash
  cd beta-bot && pytest
  cd ../web && npm run lint
  ```

## 5. Полезные советы
- Храните секреты в `.env` (не коммитится) и `bot/.env` (локальное окружение).
- Для обновления зависимостей используйте `make install` (бот) и `npm install` (web).
- При работе нескольких инстансов бота используйте внешний сторедж (Redis/DB). Локальная реализация рассчитана на одиночный процесс.
- Данные пользователей сохраняются в `bot/data/db.json`. После каждого обновления создаётся `.bak`-файл на случай повреждения основного файла.

