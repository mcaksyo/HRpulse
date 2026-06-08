"""
Схемы опросов.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from models.survey import AnonymityMode, SurveyStatus
from schemas.question import QuestionResponse


class SurveyCreate(BaseModel):
    """Схема создания опроса."""
    title: str = Field(..., min_length=1, max_length=500, description="Заголовок опроса")
    description: Optional[str] = Field(None, description="Описание опроса")
    anonymity: AnonymityMode = Field(
        AnonymityMode.NONE, description="Режим анонимности"
    )
    target_roles: Optional[list[str]] = Field(None, description="Целевые роли")
    target_departments: Optional[list[str]] = Field(None, description="Целевые отделы")
    starts_at: Optional[datetime] = Field(None, description="Дата начала")
    ends_at: Optional[datetime] = Field(None, description="Дата окончания")
    estimated_minutes: int = Field(5, ge=1, le=120, description="Ожидаемое время прохождения")


class SurveyUpdate(BaseModel):
    """Схема обновления опроса."""
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = None
    anonymity: Optional[AnonymityMode] = None
    target_roles: Optional[list[str]] = None
    target_departments: Optional[list[str]] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    estimated_minutes: Optional[int] = Field(None, ge=1, le=120)


class SurveyResponse(BaseModel):
    """Схема ответа с данными опроса."""
    id: int
    created_by: int
    title: str
    description: Optional[str] = None
    status: SurveyStatus
    anonymity: AnonymityMode
    target_roles: Optional[list[str]] = None
    target_departments: Optional[list[str]] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    estimated_minutes: int
    created_at: datetime
    updated_at: datetime
    questions: list[QuestionResponse] = []
    responses_count: int = 0

    model_config = {"from_attributes": True}


class SurveyListItem(BaseModel):
    """Элемент списка опросов (без вопросов)."""
    id: int
    created_by: int
    title: str
    description: Optional[str] = None
    status: SurveyStatus
    anonymity: AnonymityMode
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    estimated_minutes: int
    created_at: datetime
    responses_count: int = 0

    model_config = {"from_attributes": True}


class SurveyListResponse(BaseModel):
    """Список опросов с пагинацией."""
    items: list[SurveyListItem]
    total: int
    page: int
    per_page: int
