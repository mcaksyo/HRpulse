"""
Модель ответа на опрос.
Поддерживает анонимные и именные ответы, дедупликацию.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class SurveyResponse(Base):
    """Модель ответа пользователя на опрос."""

    __tablename__ = "survey_responses"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    survey_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("surveys.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Токен для анонимных ответов (хеш от user_id + survey_id)
    anonymous_token: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Ограничение: один пользователь — один ответ на опрос
    __table_args__ = (
        UniqueConstraint("survey_id", "user_id", name="uq_survey_user_response"),
    )

    # Связи
    survey: Mapped["Survey"] = relationship(  # noqa: F821
        "Survey", back_populates="responses"
    )
    user: Mapped[Optional["User"]] = relationship(  # noqa: F821
        "User", back_populates="responses"
    )
    answers: Mapped[list["Answer"]] = relationship(  # noqa: F821
        "Answer", back_populates="response", lazy="selectin",
        cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<SurveyResponse(id={self.id}, survey_id={self.survey_id}, user_id={self.user_id})>"
