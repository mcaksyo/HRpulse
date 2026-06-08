"""
Модель ответа на конкретный вопрос.
Значение хранится в JSON для универсальности (текст, числа, массивы).
"""

from sqlalchemy import (
    BigInteger,
    ForeignKey,
)
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Answer(Base):
    """Модель ответа на отдельный вопрос."""

    __tablename__ = "answers"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    response_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("survey_responses.id", ondelete="CASCADE"), nullable=False
    )
    question_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("questions.id", ondelete="CASCADE"), nullable=False
    )
    # Значение ответа в JSON: строка, число, массив и т.д.
    value: Mapped[dict | list | str | int | float | None] = mapped_column(
        JSON, nullable=True
    )

    # Связи
    response: Mapped["SurveyResponse"] = relationship(  # noqa: F821
        "SurveyResponse", back_populates="answers"
    )
    question: Mapped["Question"] = relationship(  # noqa: F821
        "Question", back_populates="answers"
    )

    def __repr__(self) -> str:
        return f"<Answer(id={self.id}, question_id={self.question_id})>"
