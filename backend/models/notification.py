"""
Модель уведомления.
Отслеживает канал доставки, статус и метрики (открытие, клик).
"""

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class NotificationChannel(str, enum.Enum):
    """Каналы доставки уведомлений."""
    WEB_PUSH = "web_push"
    SMS = "sms"
    EMAIL = "email"
    TELEGRAM = "telegram"


class NotificationStatus(str, enum.Enum):
    """Статусы уведомлений."""
    PENDING = "pending"
    SENT = "sent"
    DELIVERED = "delivered"
    FAILED = "failed"
    OPENED = "opened"
    CLICKED = "clicked"


class Notification(Base):
    """Модель уведомления с метриками доставки."""

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    survey_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("surveys.id", ondelete="SET NULL"), nullable=True
    )
    channel: Mapped[NotificationChannel] = mapped_column(
        Enum(NotificationChannel), nullable=False
    )
    status: Mapped[NotificationStatus] = mapped_column(
        Enum(NotificationStatus), default=NotificationStatus.PENDING, nullable=False
    )
    cost: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=0.0)
    sent_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    opened_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    clicked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Связи
    user: Mapped["User"] = relationship(  # noqa: F821
        "User", back_populates="notifications"
    )
    survey: Mapped[Optional["Survey"]] = relationship(  # noqa: F821
        "Survey", back_populates="notifications"
    )

    def __repr__(self) -> str:
        return f"<Notification(id={self.id}, channel={self.channel}, status={self.status})>"
