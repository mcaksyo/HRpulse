"""
Конфигурация приложения PulseHR.
Все настройки загружаются из переменных окружения.
"""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Настройки приложения, загружаемые из .env файла или переменных окружения."""

    # Основные настройки
    APP_NAME: str = "PulseHR"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    ALLOW_SEED_ENDPOINT: bool = False

    # База данных PostgreSQL
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/pulsehr"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    JWT_SECRET: str = "super-secret-jwt-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 часа
    JWT_REFRESH_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30  # 30 дней

    # OTP
    OTP_LENGTH: int = 6
    OTP_TTL_SECONDS: int = 300  # 5 минут
    OTP_RATE_LIMIT_SECONDS: int = 60  # 1 минута между запросами

    # VAPID ключи для Web Push
    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY: str = ""
    VAPID_CLAIMS_EMAIL: str = "mailto:admin@pulsehr.ru"

    # SMS настройки (мок в MVP)
    SMS_API_URL: str = "https://sms.example.com/api/send"
    SMS_API_KEY: str = "mock-sms-api-key"

    # Email настройки (мок в MVP)
    EMAIL_SMTP_HOST: str = "smtp.example.com"
    EMAIL_SMTP_PORT: int = 587
    EMAIL_SMTP_USER: str = "noreply@pulsehr.ru"
    EMAIL_SMTP_PASSWORD: str = "mock-password"

    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # Ограничения уведомлений
    MAX_NOTIFICATIONS_PER_DAY: int = 5

    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ]

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
    }


settings = Settings()
