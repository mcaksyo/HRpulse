"""
Сервис аналитики.
Расчёт eNPS, процентов прохождения, разбивка по отделам, метрики уведомлений.
"""

from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.answer import Answer
from models.question import Question, QuestionType
from models.response import SurveyResponse
from models.survey import Survey, SurveyStatus
from models.user import User
from schemas.analytics import (
    AnalyticsOverview,
    DashboardOverview,
    DepartmentBreakdown,
    ENPSResult,
    NotificationMetrics,
    QuestionAnalytics,
)
from services.notification_service import get_notification_metrics


def calculate_enps(scores: list[int]) -> ENPSResult:
    """
    Расчёт eNPS (Employee Net Promoter Score).
    Формула: (% промоутеров [9-10] - % детракторов [0-6]) × 100
    """
    if not scores:
        return ENPSResult(
            score=0.0,
            promoters_count=0,
            passives_count=0,
            detractors_count=0,
            total_responses=0,
            promoters_pct=0.0,
            detractors_pct=0.0,
        )

    total = len(scores)
    promoters = sum(1 for s in scores if s >= 9)
    passives = sum(1 for s in scores if 7 <= s <= 8)
    detractors = sum(1 for s in scores if s <= 6)

    promoters_pct = (promoters / total) * 100
    detractors_pct = (detractors / total) * 100
    enps_score = promoters_pct - detractors_pct

    return ENPSResult(
        score=round(enps_score, 1),
        promoters_count=promoters,
        passives_count=passives,
        detractors_count=detractors,
        total_responses=total,
        promoters_pct=round(promoters_pct, 1),
        detractors_pct=round(detractors_pct, 1),
    )


async def get_survey_analytics(
    db: AsyncSession, survey_id: int
) -> AnalyticsOverview:
    """Полная аналитика по опросу."""
    # Получаем опрос
    survey_result = await db.execute(
        select(Survey).where(Survey.id == survey_id)
    )
    survey = survey_result.scalar_one_or_none()
    if not survey:
        raise ValueError(f"Опрос с ID {survey_id} не найден")

    # Подсчёт приглашённых (все активные пользователи)
    total_invited_q = select(func.count(User.id)).where(User.is_active == True)  # noqa: E712
    if survey.target_departments:
        total_invited_q = total_invited_q.where(
            User.department.in_(survey.target_departments)
        )
    total_invited = await db.scalar(total_invited_q) or 0

    # Подсчёт ответов
    total_responses = await db.scalar(
        select(func.count(SurveyResponse.id)).where(
            SurveyResponse.survey_id == survey_id,
            SurveyResponse.completed_at.isnot(None),
        )
    ) or 0

    # Процент прохождения
    completion_rate = (total_responses / total_invited * 100) if total_invited > 0 else 0.0

    # Среднее время прохождения
    avg_time_result = await db.execute(
        select(
            func.avg(
                func.extract(
                    "epoch",
                    SurveyResponse.completed_at - SurveyResponse.started_at,
                )
            )
        ).where(
            SurveyResponse.survey_id == survey_id,
            SurveyResponse.completed_at.isnot(None),
        )
    )
    avg_time_seconds = avg_time_result.scalar()
    avg_time_minutes = round(avg_time_seconds / 60, 1) if avg_time_seconds else None

    # Аналитика по вопросам
    questions_result = await db.execute(
        select(Question)
        .where(Question.survey_id == survey_id)
        .order_by(Question.order_num)
    )
    questions = list(questions_result.scalars().all())

    questions_analytics = []
    all_nps_scores = []

    for question in questions:
        qa = await _analyze_question(db, question, survey_id)
        questions_analytics.append(qa)

        # Собираем NPS-баллы для общего eNPS
        if question.type == QuestionType.SCALE and question.scale_max == 10:
            answers_result = await db.execute(
                select(Answer.value)
                .join(SurveyResponse, Answer.response_id == SurveyResponse.id)
                .where(
                    Answer.question_id == question.id,
                    SurveyResponse.survey_id == survey_id,
                    SurveyResponse.completed_at.isnot(None),
                )
            )
            for row in answers_result:
                val = row[0]
                if isinstance(val, (int, float)):
                    all_nps_scores.append(int(val))
                elif isinstance(val, dict) and "value" in val:
                    all_nps_scores.append(int(val["value"]))

    # eNPS общий
    enps = calculate_enps(all_nps_scores) if all_nps_scores else None

    # Разбивка по отделам
    department_breakdown = await _department_breakdown(db, survey_id)

    return AnalyticsOverview(
        survey_id=survey_id,
        survey_title=survey.title,
        total_invited=total_invited,
        total_responses=total_responses,
        completion_rate=round(completion_rate, 1),
        average_completion_time_minutes=avg_time_minutes,
        questions_analytics=questions_analytics,
        department_breakdown=department_breakdown,
        enps=enps,
    )


async def _analyze_question(
    db: AsyncSession, question: Question, survey_id: int
) -> QuestionAnalytics:
    """Аналитика по отдельному вопросу."""
    # Получаем все ответы на этот вопрос
    answers_result = await db.execute(
        select(Answer.value)
        .join(SurveyResponse, Answer.response_id == SurveyResponse.id)
        .where(
            Answer.question_id == question.id,
            SurveyResponse.survey_id == survey_id,
            SurveyResponse.completed_at.isnot(None),
        )
    )
    raw_values = [row[0] for row in answers_result]
    total_answers = len(raw_values)

    distribution: dict[str, int] = {}
    average: Optional[float] = None
    enps: Optional[ENPSResult] = None

    if question.type in (QuestionType.SINGLE_CHOICE, QuestionType.MULTIPLE_CHOICE):
        # Распределение по вариантам
        counter: Counter = Counter()
        for val in raw_values:
            if isinstance(val, list):
                for v in val:
                    counter[str(v)] += 1
            elif isinstance(val, dict) and "value" in val:
                v = val["value"]
                if isinstance(v, list):
                    for item in v:
                        counter[str(item)] += 1
                else:
                    counter[str(v)] += 1
            else:
                counter[str(val)] += 1
        distribution = dict(counter)

    elif question.type in (QuestionType.SCALE, QuestionType.RATING):
        # Числовое распределение
        numeric_values = []
        for val in raw_values:
            if isinstance(val, (int, float)):
                numeric_values.append(int(val))
            elif isinstance(val, dict) and "value" in val:
                numeric_values.append(int(val["value"]))
            elif isinstance(val, str) and val.isdigit():
                numeric_values.append(int(val))

        counter = Counter(numeric_values)
        distribution = {str(k): v for k, v in sorted(counter.items())}
        average = round(sum(numeric_values) / len(numeric_values), 2) if numeric_values else None

        # eNPS для шкал 0-10
        if question.type == QuestionType.SCALE and question.scale_max == 10:
            enps = calculate_enps(numeric_values)

    elif question.type == QuestionType.TEXT:
        # Для текстовых — просто количество ответов
        distribution = {"answered": total_answers}

    return QuestionAnalytics(
        question_id=question.id,
        question_text=question.text,
        question_type=question.type.value,
        total_answers=total_answers,
        distribution=distribution,
        average=average,
        enps=enps,
    )


async def _department_breakdown(
    db: AsyncSession, survey_id: int
) -> list[DepartmentBreakdown]:
    """Разбивка аналитики по отделам."""
    # Получаем ответы с информацией о пользователях
    responses_result = await db.execute(
        select(
            User.department,
            func.count(SurveyResponse.id).label("responses_count"),
        )
        .join(SurveyResponse, User.id == SurveyResponse.user_id)
        .where(
            SurveyResponse.survey_id == survey_id,
            SurveyResponse.completed_at.isnot(None),
            User.department.isnot(None),
        )
        .group_by(User.department)
    )

    breakdown = []
    for row in responses_result:
        dept = row[0]
        resp_count = row[1]

        # Подсчёт сотрудников в отделе
        dept_total = await db.scalar(
            select(func.count(User.id)).where(
                User.department == dept,
                User.is_active == True,  # noqa: E712
            )
        ) or 0

        completion_rate = (resp_count / dept_total * 100) if dept_total > 0 else 0.0

        breakdown.append(
            DepartmentBreakdown(
                department=dept,
                responses_count=resp_count,
                completion_rate=round(completion_rate, 1),
            )
        )

    return breakdown


async def get_dashboard_overview(db: AsyncSession) -> DashboardOverview:
    """Получение данных для дашборда HR."""
    # Общее количество опросов
    total_surveys = await db.scalar(select(func.count(Survey.id))) or 0

    # Активные опросы
    active_surveys = await db.scalar(
        select(func.count(Survey.id)).where(
            Survey.status.in_([SurveyStatus.PUBLISHED, SurveyStatus.ACTIVE])
        )
    ) or 0

    # Общее количество ответов
    total_responses = await db.scalar(
        select(func.count(SurveyResponse.id)).where(
            SurveyResponse.completed_at.isnot(None)
        )
    ) or 0

    # Количество сотрудников
    total_employees = await db.scalar(
        select(func.count(User.id)).where(User.is_active == True)  # noqa: E712
    ) or 0

    # Средний процент прохождения
    surveys_result = await db.execute(
        select(Survey).where(
            Survey.status.in_([
                SurveyStatus.PUBLISHED,
                SurveyStatus.ACTIVE,
                SurveyStatus.CLOSED,
            ])
        )
    )
    surveys = list(surveys_result.scalars().all())

    completion_rates = []
    for survey in surveys:
        resp_count = await db.scalar(
            select(func.count(SurveyResponse.id)).where(
                SurveyResponse.survey_id == survey.id,
                SurveyResponse.completed_at.isnot(None),
            )
        ) or 0
        if total_employees > 0:
            completion_rates.append(resp_count / total_employees * 100)

    avg_completion = round(
        sum(completion_rates) / len(completion_rates), 1
    ) if completion_rates else 0.0

    # Последние опросы
    recent_result = await db.execute(
        select(Survey)
        .order_by(Survey.created_at.desc())
        .limit(5)
    )
    recent = []
    for s in recent_result.scalars().all():
        resp_count = await db.scalar(
            select(func.count(SurveyResponse.id)).where(
                SurveyResponse.survey_id == s.id,
                SurveyResponse.completed_at.isnot(None),
            )
        ) or 0
        recent.append({
            "id": s.id,
            "title": s.title,
            "status": s.status.value,
            "responses_count": resp_count,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        })

    # Метрики уведомлений
    notif_metrics_data = await get_notification_metrics(db)
    notif_metrics = NotificationMetrics(**notif_metrics_data)

    return DashboardOverview(
        total_surveys=total_surveys,
        active_surveys=active_surveys,
        total_responses=total_responses,
        total_employees=total_employees,
        average_completion_rate=avg_completion,
        recent_surveys=recent,
        notification_metrics=notif_metrics,
    )
