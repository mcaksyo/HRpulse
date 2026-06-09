# PulseHR

Корпоративный сервис для проведения опросов сотрудников, сбора обратной связи и базовой HR-аналитики.

Проект сделан как MVP для хакатона по ТЗ СКС Ломбард. Внутри уже собраны ключевые сценарии:
- авторизация по номеру телефона и OTP;
- личный кабинет сотрудника;
- HR-дашборд;
- создание и публикация опросов;
- визуальный конструктор опросов;
- прохождение опросов и просмотр аналитики;
- PostgreSQL, Redis, Celery и Docker-развёртывание.

## Быстрый старт

Это основной и рекомендуемый способ запуска проекта.

### Что нужно перед стартом

- `Docker Desktop`
- запущенный `Docker Engine`
- свободные порты: `5173`, `8000`, `5432`, `6379`

Если вы на Windows и `docker compose` не отвечает, сначала откройте `Docker Desktop` и дождитесь, пока он полностью поднимется.

### Запуск в 3 шага

1. Подготовьте `.env`:

```bash
Copy-Item .env.example .env
```

Если файл `.env` уже есть в корне проекта, этот шаг можно пропустить.

2. Перейдите в корень проекта и запустите стек:

```bash
docker compose up -d --build
```

3. Проверьте, что контейнеры поднялись:

```bash
docker compose ps
```

Ожидаемый результат: сервисы `postgres`, `redis`, `backend`, `celery-worker`, `celery-beat`, `frontend` находятся в статусе `Up`.

## После запуска

Будут доступны:

- frontend: `http://localhost:5173`
- backend API: `http://localhost:8000`
- healthcheck: `http://localhost:8000/health`
- Swagger: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

Проверка backend:

```bash
Invoke-RestMethod http://localhost:8000/health
```

Ожидаемо должно вернуться что-то вроде:

```json
{
  "status": "healthy",
  "database": "connected",
  "redis": "connected"
}
```

## Как остановить проект

Остановить контейнеры:

```bash
docker compose down
```

Остановить контейнеры и удалить тома с данными:

```bash
docker compose down -v
```

Если нужно посмотреть логи:

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres
```

## Тестовые аккаунты

Для локального Docker-стенда доступны тестовые пользователи:

- HR: `+7 900 123-45-67`
- Сотрудник: `+7 900 123-45-68`
- Дополнительные сотрудники: `+7 900 123-45-69`, `+7 900 123-45-70`

OTP-код backend возвращает в ответе `send-otp` в поле `debug_code`, чтобы не подключать реальный SMS-провайдер во время разработки и демо.

## Основные команды

Запуск:

```bash
docker compose up -d --build
```

Проверка статуса:

```bash
docker compose ps
```

Перезапуск одного сервиса:

```bash
docker compose restart frontend
docker compose restart backend
```

Просмотр логов:

```bash
docker compose logs -f
```

## Локальный запуск без Docker

Этот вариант нужен только для разработки. Для демо и сдачи лучше использовать Docker Compose.

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Важно

Для локального запуска без Docker у вас отдельно должны быть подняты:

- `PostgreSQL`
- `Redis`

И переменные окружения в `.env` должны указывать на локальные сервисы, например:

- `DATABASE_URL=postgresql+asyncpg://pulsehr:pulsehr_secret@localhost:5432/pulsehr`
- `REDIS_URL=redis://localhost:6379/0`

## Что реализовано

### Backend

- `FastAPI`
- работа с пользователями, опросами, вопросами и ответами
- аналитика по опросам
- экспорт результатов
- маршруты уведомлений и push-подписок
- интеграция с `PostgreSQL`, `Redis`, `Celery`

### Frontend

- `React + Vite`
- OTP-авторизация
- кабинет сотрудника
- HR-дашборд
- конструктор опросов
- экран прохождения опроса

## Стек

- Frontend: `React`, `Vite`, `react-router-dom`, `recharts`
- Backend: `FastAPI`, `SQLAlchemy`, `Pydantic`
- Database: `PostgreSQL`
- Queue / Cache: `Redis`, `Celery`
- Infra: `Docker`, `Docker Compose`

## Структура проекта

```text
HACKATON/
├── backend/              # FastAPI backend
├── frontend/             # React frontend
├── docker-compose.yml    # запуск всего проекта
├── .env.example          # пример переменных окружения
├── .env                  # локальные переменные окружения
├── ТЗ.docx
├── ТЗ.pdf
└── README.md
```

## Основные пользовательские роли

### HR

- создаёт опросы;
- настраивает вопросы и ветвления;
- публикует опросы;
- просматривает аналитику;
- выгружает результаты.

### Сотрудник

- авторизуется по номеру телефона;
- получает доступные опросы;
- проходит опросы;
- управляет настройками уведомлений.

## Частые проблемы

### `docker compose` не отвечает

Проверьте, что открыт `Docker Desktop` и движок успел подняться.

Проверка:

```bash
docker version
```

### Не открывается frontend

Проверьте, что контейнер `frontend` в статусе `Up`:

```bash
docker compose ps
```

Если нужно, перезапустите его:

```bash
docker compose restart frontend
```

### Backend не видит базу

Проверьте `health`:

```bash
Invoke-RestMethod http://localhost:8000/health
```

И убедитесь, что контейнер `postgres` healthy:

```bash
docker compose ps
```

## Состав команды

Заполнить перед сдачей:

| Роль | ФИО | Зона ответственности |
|------|-----|----------------------|
| Team Lead | TODO | TODO |
| Backend | TODO | TODO |
| Frontend | TODO | TODO |
| Design / Analytics | TODO | TODO |

## Контактные данные

Заполнить перед сдачей:

- Telegram: `TODO`
- Email: `TODO`
- Телефон: `TODO`
- GitHub / GitLab: `TODO`

## Статус проекта

Текущий статус: MVP для демонстрации ключевых сценариев PulseHR.
