"""
Роутер аутентификации.
OTP по телефону, JWT токены, информация о текущем пользователе.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.user import User
from schemas.auth import (
    OTPVerify,
    PhoneInput,
    TokenResponse,
    UserResponse,
)
from services.auth_service import (
    create_access_token,
    create_refresh_token,
    get_current_user,
    get_or_create_user,
    send_otp,
    verify_otp,
)

router = APIRouter(prefix="/auth", tags=["Аутентификация"])


@router.post(
    "/send-otp",
    summary="Отправка OTP-кода",
    description="Генерирует 6-значный OTP-код и сохраняет в Redis на 5 минут. "
                "В MVP код выводится в консоль сервера.",
)
async def send_otp_endpoint(data: PhoneInput):
    """Отправка OTP-кода на номер телефона."""
    code = await send_otp(data.phone)
    return {
        "message": "OTP-код отправлен",
        "phone": data.phone,
        # В MVP отдаём код в ответе для удобства тестирования
        "debug_code": code,
    }


@router.post(
    "/verify-otp",
    response_model=TokenResponse,
    summary="Верификация OTP-кода",
    description="Проверяет OTP-код и возвращает JWT-токены.",
)
async def verify_otp_endpoint(
    data: OTPVerify,
    db: AsyncSession = Depends(get_db),
):
    """Верификация OTP-кода и выдача JWT-токенов."""
    await verify_otp(data.phone, data.code)

    # Получаем или создаём пользователя
    user = await get_or_create_user(db, data.phone)

    # Создаём токены
    access_token = create_access_token(user.id, user.role.value)
    refresh_token = create_refresh_token(user.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.model_validate(user),
    )


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Текущий пользователь",
    description="Возвращает информацию о текущем авторизованном пользователе.",
)
async def get_me(current_user: User = Depends(get_current_user)):
    """Получение информации о текущем пользователе."""
    return UserResponse.model_validate(current_user)
