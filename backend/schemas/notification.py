"""
Схемы уведомлений и подписок.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from models.notification import NotificationChannel, NotificationStatus
from models.notification_preference import PreferredTime


class PushSubscriptionCreate(BaseModel):
    """Схема создания подписки на Push-уведомления."""
    endpoint: str = Field(..., description="URL endpoint для push")
    p256dh: str = Field(..., description="Публичный ключ подписки")
    auth_key: str = Field(..., description="Ключ аутентификации")
    device_name: Optional[str] = Field(None, description="Название устройства")


class PushSubscriptionResponse(BaseModel):
    """Схема ответа с данными подписки."""
    id: int
    endpoint: str
    device_name: Optional[str] = None
    active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationPreferenceUpdate(BaseModel):
    """Схема обновления предпочтений уведомлений."""
    web_push_enabled: Optional[bool] = None
    sms_enabled: Optional[bool] = None
    telegram_enabled: Optional[bool] = None
    email_enabled: Optional[bool] = None
    preferred_time: Optional[PreferredTime] = None


class NotificationPreferenceResponse(BaseModel):
    """Схема ответа с предпочтениями уведомлений."""
    id: int
    user_id: int
    web_push_enabled: bool
    sms_enabled: bool
    telegram_enabled: bool
    email_enabled: bool
    preferred_time: PreferredTime

    model_config = {"from_attributes": True}


class NotificationResponse(BaseModel):
    """Схема ответа с данными уведомления."""
    id: int
    user_id: int
    survey_id: Optional[int] = None
    channel: NotificationChannel
    status: NotificationStatus
    cost: Optional[float] = None
    sent_at: Optional[datetime] = None
    opened_at: Optional[datetime] = None
    clicked_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationHistoryResponse(BaseModel):
    """Список уведомлений с пагинацией."""
    items: list[NotificationResponse]
    total: int
    page: int
    per_page: int
