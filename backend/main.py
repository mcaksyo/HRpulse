"""
Главный модуль приложения PulseHR.
FastAPI app с CORS, роутерами и событиями жизненного цикла.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Жизненный цикл приложения: создание таблиц при запуске."""
    from database import create_tables
    # Импортируем все модели, чтобы они зарегистрировались в Base.metadata
    import models  # noqa: F401

    print(f"\n🚀 Запуск {settings.APP_NAME} v{settings.APP_VERSION}")
    print(f"📦 База данных: {settings.DATABASE_URL}")
    print(f"🔴 Redis: {settings.REDIS_URL}")

    await create_tables()
    print("✅ Таблицы базы данных созданы/обновлены\n")

    yield

    print(f"\n🛑 Остановка {settings.APP_NAME}\n")


# Создание приложения FastAPI
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "PulseHR — платформа корпоративных опросов сотрудников. "
        "Конструктор опросов, OTP-аутентификация, аналитика eNPS, "
        "каскадные уведомления (Web Push → SMS → Email)."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === Подключение роутеров ===

from routers.auth import router as auth_router  # noqa: E402
from routers.surveys import router as surveys_router  # noqa: E402
from routers.questions import router as questions_router  # noqa: E402
from routers.responses import router as responses_router  # noqa: E402
from routers.analytics import router as analytics_router  # noqa: E402
from routers.notifications import router as notifications_router  # noqa: E402
from routers.users import router as users_router  # noqa: E402

app.include_router(auth_router, prefix="/api/v1")
app.include_router(surveys_router, prefix="/api/v1")
app.include_router(questions_router, prefix="/api/v1")
app.include_router(responses_router, prefix="/api/v1")
app.include_router(analytics_router, prefix="/api/v1")
app.include_router(notifications_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")


# === Корневые эндпоинты ===


@app.get("/", tags=["Системные"])
async def root():
    """Корневой эндпоинт."""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "api": "/api/v1",
    }


@app.get("/health", tags=["Системные"])
async def health_check():
    """Проверка здоровья сервиса."""
    import redis.asyncio as aioredis
    from sqlalchemy import text
    from database import engine

    health = {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }

    # Проверка БД
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        health["database"] = "connected"
    except Exception as e:
        health["database"] = f"error: {str(e)}"
        health["status"] = "degraded"

    # Проверка Redis
    try:
        r = aioredis.from_url(settings.REDIS_URL)
        await r.ping()
        await r.close()
        health["redis"] = "connected"
    except Exception as e:
        health["redis"] = f"error: {str(e)}"
        health["status"] = "degraded"

    return health


@app.post("/api/v1/seed", tags=["Системные"])
async def seed_data():
    """
    Заполнение базы тестовыми данными.
    Создаёт HR-пользователя, сотрудников и примеры опросов.
    """
    if not settings.ALLOW_SEED_ENDPOINT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seed endpoint is disabled.",
        )

    from database import async_session
    from seed import seed_database

    async with async_session() as db:
        try:
            result = await seed_database(db)
            await db.commit()
            return result
        except Exception as e:
            await db.rollback()
            raise e


@app.get("/api/v1/vapid-public-key", tags=["Системные"])
async def get_vapid_public_key():
    """Получение публичного VAPID-ключа для подписки на Push-уведомления."""
    return {"public_key": settings.VAPID_PUBLIC_KEY}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
