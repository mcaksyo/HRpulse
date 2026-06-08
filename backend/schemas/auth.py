"""
Схемы аутентификации и пользователей.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from models.user import UserRole


class PhoneInput(BaseModel):
    """Схема ввода номера телефона для получения OTP."""
    phone: str = Field(
        ...,
        min_length=10,
        max_length=20,
        description="Номер телефона в формате +7XXXXXXXXXX",
        examples=["+79001234567"],
    )


class OTPVerify(BaseModel):
    """Схема верификации OTP-кода."""
    phone: str = Field(..., description="Номер телефона")
    code: str = Field(
        ...,
        min_length=6,
        max_length=6,
        description="6-значный OTP-код",
        examples=["123456"],
    )


class TokenResponse(BaseModel):
    """Ответ с JWT-токенами."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class UserResponse(BaseModel):
    """Схема ответа с данными пользователя."""
    id: int
    phone: str
    name: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    city: Optional[str] = None
    timezone: str = "Europe/Moscow"
    role: UserRole
    consent_notifications: bool = True
    dnd_mode: bool = False
    dnd_until: Optional[datetime] = None
    is_active: bool = True
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    """Схема обновления профиля пользователя."""
    name: Optional[str] = Field(None, max_length=255)
    department: Optional[str] = Field(None, max_length=255)
    position: Optional[str] = Field(None, max_length=255)
    city: Optional[str] = Field(None, max_length=255)
    timezone: Optional[str] = Field(None, max_length=50)
    consent_notifications: Optional[bool] = None
    dnd_mode: Optional[bool] = None
    dnd_until: Optional[datetime] = None


class UserCreate(BaseModel):
    """Схема создания пользователя (для seed)."""
    phone: str
    name: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    city: Optional[str] = None
    role: UserRole = UserRole.EMPLOYEE


class UserListResponse(BaseModel):
    """Список пользователей с пагинацией."""
    items: list[UserResponse]
    total: int
    page: int
    per_page: int


# Обновление forward reference
TokenResponse.model_rebuild()
