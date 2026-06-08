"""
Модель предпочтений уведомлений пользователя.
Позволяет включать/выключать каналы и выбирать предпочтительное время.
"""

import enum
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Enum,
    ForeignKey,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class PreferredTime(str, enum.Enum):
    """Предпочтительное время получения уведомлений."""
    MORNING = "morning"     # 09:00-12:00
    AFTERNOON = "afternoon"  # 12:00-17:00
    EVENING = "evening"      # 17:00-21:00
    ANY = "any"              # Любое время


class NotificationPreference(Base):
    """Модель предпочтений уведомлений пользователя."""

    __tablename__ = "notification_preferences"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    web_push_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    sms_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    telegram_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    email_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    preferred_time: Mapped[PreferredTime] = mapped_column(
        Enum(PreferredTime), default=PreferredTime.ANY, nullable=False
    )

    # Связи
    user: Mapped["User"] = relationship(  # noqa: F821
        "User", back_populates="notification_preference"
    )

    def __repr__(self) -> str:
        return f"<NotificationPreference(id={self.id}, user_id={self.user_id})>"
