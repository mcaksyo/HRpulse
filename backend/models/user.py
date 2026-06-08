"""
Модель пользователя.
Поддерживает роли HR и сотрудник, настройки уведомлений и DND.
"""

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class UserRole(str, enum.Enum):
    """Роли пользователей в системе."""
    HR = "hr"
    EMPLOYEE = "employee"


class User(Base):
    """Модель пользователя системы PulseHR."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    phone: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    department: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    position: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    timezone: Mapped[str] = mapped_column(String(50), default="Europe/Moscow")
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole), default=UserRole.EMPLOYEE, nullable=False
    )
    consent_notifications: Mapped[bool] = mapped_column(Boolean, default=True)
    dnd_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    dnd_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Связи
    surveys: Mapped[list["Survey"]] = relationship(  # noqa: F821
        "Survey", back_populates="creator", lazy="selectin"
    )
    responses: Mapped[list["SurveyResponse"]] = relationship(  # noqa: F821
        "SurveyResponse", back_populates="user", lazy="selectin"
    )
    push_subscriptions: Mapped[list["PushSubscription"]] = relationship(  # noqa: F821
        "PushSubscription", back_populates="user", lazy="selectin"
    )
    notifications: Mapped[list["Notification"]] = relationship(  # noqa: F821
        "Notification", back_populates="user", lazy="selectin"
    )
    notification_preference: Mapped[Optional["NotificationPreference"]] = relationship(  # noqa: F821
        "NotificationPreference", back_populates="user", uselist=False, lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<User(id={self.id}, phone={self.phone}, role={self.role})>"
