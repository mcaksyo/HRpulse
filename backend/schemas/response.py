"""
Схемы ответов на опросы.
"""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class AnswerInput(BaseModel):
    """Схема ввода ответа на один вопрос."""
    question_id: int = Field(..., description="ID вопроса")
    value: Any = Field(..., description="Значение ответа (строка, число, массив)")


class SurveySubmission(BaseModel):
    """Схема отправки ответов на весь опрос."""
    answers: list[AnswerInput] = Field(
        ..., min_length=1, description="Список ответов на вопросы"
    )


class AnswerResponse(BaseModel):
    """Схема ответа на вопрос в API."""
    id: int
    question_id: int
    value: Any

    model_config = {"from_attributes": True}


class ResponseStatus(BaseModel):
    """Статус ответа пользователя на опрос."""
    id: int
    survey_id: int
    user_id: Optional[int] = None
    started_at: datetime
    completed_at: Optional[datetime] = None
    answers: list[AnswerResponse] = []

    model_config = {"from_attributes": True}


class ResponseListItem(BaseModel):
    """Элемент списка ответов (для HR)."""
    id: int
    survey_id: int
    user_id: Optional[int] = None
    user_name: Optional[str] = None
    user_department: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None
    answers_count: int = 0

    model_config = {"from_attributes": True}
