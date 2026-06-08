"""
Сервис аутентификации.
OTP генерация, верификация через Redis, JWT создание/валидация.
"""

import random
import string
from datetime import datetime, timedelta, timezone
from typing import Optional

import redis.asyncio as redis
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from models.user import User, UserRole

# HTTP Bearer схема для JWT
security = HTTPBearer(auto_error=False)

# Redis клиент
redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)

PHONE_ALIASES = {
    "+79991234567": "+79001234567",
    "+79997654321": "+79001234568",
}


def resolve_phone_alias(phone: str) -> str:
    """Приводит старые демо-номера к seeded-пользователям."""
    return PHONE_ALIASES.get(phone, phone)


def generate_otp(length: int = 6) -> str:
    """Генерация случайного OTP-кода."""
    return "".join(random.choices(string.digits, k=length))


async def send_otp(phone: str) -> str:
    """
    Генерация и сохранение OTP-кода в Redis.
    В MVP код выводится в консоль сервера.
    """
    phone = resolve_phone_alias(phone)

    # Проверка rate limit
    rate_key = f"otp_rate:{phone}"
    if await redis_client.exists(rate_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Слишком частые запросы. Подождите минуту.",
        )

    # Генерация OTP
    code = generate_otp(settings.OTP_LENGTH)

    # Сохранение в Redis с TTL
    otp_key = f"otp:{phone}"
    await redis_client.setex(otp_key, settings.OTP_TTL_SECONDS, code)

    # Rate limit — 1 запрос в минуту
    await redis_client.setex(rate_key, settings.OTP_RATE_LIMIT_SECONDS, "1")

    # Счётчик неудачных попыток
    attempts_key = f"otp_attempts:{phone}"
    await redis_client.delete(attempts_key)

    # MVP: вывод в консоль
    print(f"\n{'='*50}")
    print(f"📱 OTP для {phone}: {code}")
    print(f"{'='*50}\n")

    return code


async def verify_otp(phone: str, code: str) -> bool:
    """Проверка OTP-кода из Redis."""
    phone = resolve_phone_alias(phone)

    # Проверка количества попыток
    attempts_key = f"otp_attempts:{phone}"
    attempts = await redis_client.get(attempts_key)
    if attempts and int(attempts) >= 5:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Превышено количество попыток. Запросите новый код.",
        )

    otp_key = f"otp:{phone}"
    stored_code = await redis_client.get(otp_key)

    if not stored_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP-код истёк или не был запрошен.",
        )

    if stored_code != code:
        # Увеличиваем счётчик неудачных попыток
        await redis_client.incr(attempts_key)
        await redis_client.expire(attempts_key, settings.OTP_TTL_SECONDS)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Неверный OTP-код.",
        )

    # Код верный — удаляем из Redis
    await redis_client.delete(otp_key)
    await redis_client.delete(attempts_key)
    return True


def create_access_token(user_id: int, role: str) -> str:
    """Создание JWT access-токена."""
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": str(user_id),
        "role": role,
        "type": "access",
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(user_id: int) -> str:
    """Создание JWT refresh-токена."""
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.JWT_REFRESH_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": str(user_id),
        "type": "refresh",
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Декодирование и валидация JWT-токена."""
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )
        return payload
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Невалидный токен: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Зависимость FastAPI: получение текущего пользователя из JWT."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Требуется авторизация.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_token(credentials.credentials)

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Невалидный тип токена.",
        )

    user_id = int(payload.get("sub", 0))
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Невалидный токен: отсутствует ID пользователя.",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Аккаунт деактивирован.",
        )

    return user


async def require_hr_role(
    current_user: User = Depends(get_current_user),
) -> User:
    """Зависимость FastAPI: проверка роли HR."""
    if current_user.role != UserRole.HR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ только для HR.",
        )
    return current_user


async def get_or_create_user(db: AsyncSession, phone: str) -> User:
    """Получение или создание пользователя по номеру телефона."""
    phone = resolve_phone_alias(phone)

    result = await db.execute(select(User).where(User.phone == phone))
    user = result.scalar_one_or_none()

    if not user:
        user = User(phone=phone, role=UserRole.EMPLOYEE)
        db.add(user)
        await db.flush()
        await db.refresh(user)
        print(f"✅ Создан новый пользователь: {phone} (ID: {user.id})")

    return user
