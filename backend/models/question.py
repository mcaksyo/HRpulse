"""
Модель вопроса опроса.
Поддерживает 5 типов вопросов и правила ветвления.
"""

import enum
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class QuestionType(str, enum.Enum):
    """Типы вопросов в конструкторе опросов."""
    SINGLE_CHOICE = "single_choice"    # Одиночный выбор
    MULTIPLE_CHOICE = "multiple_choice"  # Множественный выбор
    TEXT = "text"                        # Свободный текст
    SCALE = "scale"                      # Шкала (1-10, NPS и т.д.)
    RATING = "rating"                    # Оценка звёздами (1-5)
    MATRIX = "matrix"                    # Matrix question


class Question(Base):
    """Модель вопроса в опросе."""

    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    survey_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("surveys.id", ondelete="CASCADE"), nullable=False
    )
    order_num: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[QuestionType] = mapped_column(
        Enum(QuestionType), nullable=False
    )
    # Варианты ответов для single_choice и multiple_choice
    # Формат: ["Вариант 1", "Вариант 2", ...]
    options: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)

    # Правила ветвления
    # Формат: [{"condition": {"question_id": 1, "value": "Да"}, "action": "skip_to", "target_question_id": 5}]
    branch_rules: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)

    # Настройки шкалы
    scale_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=0)
    scale_max: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=10)
    scale_min_label: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    scale_max_label: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    required: Mapped[bool] = mapped_column(Boolean, default=True)
    branch_only: Mapped[bool] = mapped_column(Boolean, default=False)

    # Связи
    survey: Mapped["Survey"] = relationship(  # noqa: F821
        "Survey", back_populates="questions"
    )
    answers: Mapped[list["Answer"]] = relationship(  # noqa: F821
        "Answer", back_populates="question", lazy="selectin",
        cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Question(id={self.id}, type={self.type}, text={self.text[:50]})>"
