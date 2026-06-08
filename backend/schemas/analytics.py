"""
Схемы аналитики.
"""

from typing import Any, Optional

from pydantic import BaseModel, Field


class ENPSResult(BaseModel):
    """Результат расчёта eNPS."""
    score: float = Field(..., description="eNPS от -100 до 100")
    promoters_count: int = Field(0, description="Кол-во промоутеров (9-10)")
    passives_count: int = Field(0, description="Кол-во нейтральных (7-8)")
    detractors_count: int = Field(0, description="Кол-во детракторов (0-6)")
    total_responses: int = Field(0, description="Всего ответов")
    promoters_pct: float = Field(0, description="% промоутеров")
    detractors_pct: float = Field(0, description="% детракторов")


class QuestionAnalytics(BaseModel):
    """Аналитика по отдельному вопросу."""
    question_id: int
    question_text: str
    question_type: str
    total_answers: int
    distribution: dict[str, int] = Field(
        default_factory=dict, description="Распределение ответов"
    )
    average: Optional[float] = Field(None, description="Среднее (для шкал)")
    enps: Optional[ENPSResult] = Field(None, description="eNPS (для шкал 0-10)")


class DepartmentBreakdown(BaseModel):
    """Разбивка по отделам."""
    department: str
    responses_count: int
    completion_rate: float
    average_score: Optional[float] = None
    enps: Optional[ENPSResult] = None


class AnalyticsOverview(BaseModel):
    """Общая аналитика по опросу."""
    survey_id: int
    survey_title: str
    total_invited: int
    total_responses: int
    completion_rate: float
    average_completion_time_minutes: Optional[float] = None
    questions_analytics: list[QuestionAnalytics] = []
    department_breakdown: list[DepartmentBreakdown] = []
    enps: Optional[ENPSResult] = None


class DashboardOverview(BaseModel):
    """Обзор дашборда для HR."""
    total_surveys: int
    active_surveys: int
    total_responses: int
    total_employees: int
    average_completion_rate: float
    recent_surveys: list[dict[str, Any]] = []
    notification_metrics: "NotificationMetrics"


class NotificationMetrics(BaseModel):
    """Метрики уведомлений."""
    total_sent: int
    total_delivered: int
    total_opened: int
    total_clicked: int
    delivery_rate: float
    open_rate: float
    click_rate: float
    by_channel: dict[str, dict[str, int]] = Field(default_factory=dict)
    total_cost: float = 0.0


# Обновление forward reference
DashboardOverview.model_rebuild()
