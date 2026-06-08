"""
Модель опроса.
Поддерживает статусы, режимы анонимности, таргетирование по ролям.
"""

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class SurveyStatus(str, enum.Enum):
    """Статусы жизненного цикла опроса."""
    DRAFT = "draft"
    PUBLISHED = "published"
    ACTIVE = "active"
    CLOSED = "closed"
    ARCHIVED = "archived"


class AnonymityMode(str, enum.Enum):
    """Режимы анонимности опроса."""
    FULL = "full"           # Полная анонимность — нет привязки к пользователю
    PARTIAL = "partial"     # Частичная — HR видит отделы, но не имена
    NONE = "none"           # Без анонимности — HR видит кто ответил


class Survey(Base):
    """Модель опроса."""

    __tablename__ = "surveys"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    created_by: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[SurveyStatus] = mapped_column(
        Enum(SurveyStatus), default=SurveyStatus.DRAFT, nullable=False
    )
    anonymity: Mapped[AnonymityMode] = mapped_column(
        Enum(AnonymityMode), default=AnonymityMode.NONE, nullable=False
    )
    target_roles: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    target_departments: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    starts_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ends_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    estimated_minutes: Mapped[int] = mapped_column(Integer, default=5)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Связи
    creator: Mapped["User"] = relationship(  # noqa: F821
        "User", back_populates="surveys", lazy="selectin"
    )
    questions: Mapped[list["Question"]] = relationship(  # noqa: F821
        "Question", back_populates="survey", lazy="selectin",
        cascade="all, delete-orphan", order_by="Question.order_num"
    )
    responses: Mapped[list["SurveyResponse"]] = relationship(  # noqa: F821
        "SurveyResponse", back_populates="survey", lazy="selectin",
        cascade="all, delete-orphan"
    )
    notifications: Mapped[list["Notification"]] = relationship(  # noqa: F821
        "Notification", back_populates="survey", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Survey(id={self.id}, title={self.title}, status={self.status})>"
