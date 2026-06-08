"""
Схемы вопросов.
"""

from typing import Any, Optional

from pydantic import BaseModel, Field

from models.question import QuestionType


class BranchRule(BaseModel):
    """Правило ветвления вопроса."""
    condition_question_id: Optional[int] = Field(
        None, description="ID вопроса-условия"
    )
    condition_value: Any = Field(None, description="Значение для срабатывания условия")
    action: str = Field(
        "skip_to", description="Действие: skip_to, hide, show"
    )
    target_question_id: Optional[int] = Field(
        None, description="ID целевого вопроса"
    )


class QuestionCreate(BaseModel):
    """Схема создания вопроса."""
    text: str = Field(..., min_length=1, description="Текст вопроса")
    type: QuestionType = Field(..., description="Тип вопроса")
    order_num: int = Field(0, ge=0, description="Порядковый номер")
    options: Optional[Any] = Field(None, description="Answer options or matrix config")
    branch_rules: Optional[list[BranchRule]] = Field(
        None, description="Правила ветвления"
    )
    scale_min: Optional[int] = Field(None, description="Минимум шкалы")
    scale_max: Optional[int] = Field(None, description="Максимум шкалы")
    scale_min_label: Optional[str] = Field(None, description="Подпись минимума")
    scale_max_label: Optional[str] = Field(None, description="Подпись максимума")
    required: bool = Field(True, description="Обязательный вопрос")


class QuestionUpdate(BaseModel):
    """Схема обновления вопроса."""
    text: Optional[str] = Field(None, min_length=1)
    type: Optional[QuestionType] = None
    order_num: Optional[int] = Field(None, ge=0)
    options: Optional[Any] = None
    branch_rules: Optional[list[BranchRule]] = None
    scale_min: Optional[int] = None
    scale_max: Optional[int] = None
    scale_min_label: Optional[str] = None
    scale_max_label: Optional[str] = None
    required: Optional[bool] = None


class QuestionResponse(BaseModel):
    """Схема ответа с данными вопроса."""
    id: int
    survey_id: int
    order_num: int
    text: str
    type: QuestionType
    options: Optional[Any] = None
    branch_rules: Optional[list[dict]] = None
    scale_min: Optional[int] = None
    scale_max: Optional[int] = None
    scale_min_label: Optional[str] = None
    scale_max_label: Optional[str] = None
    required: bool

    model_config = {"from_attributes": True}


class QuestionReorder(BaseModel):
    """Схема для изменения порядка вопросов."""
    question_ids: list[int] = Field(
        ..., description="Список ID вопросов в новом порядке"
    )
