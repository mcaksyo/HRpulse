"""
Роутер аналитики.
eNPS, проценты прохождения, разбивка по отделам, экспорт.
"""

import io
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models.answer import Answer
from models.question import Question
from models.response import SurveyResponse
from models.survey import Survey
from models.user import User
from schemas.analytics import AnalyticsOverview, DashboardOverview
from services.analytics_service import get_dashboard_overview, get_survey_analytics
from services.auth_service import get_current_user, require_hr_role

router = APIRouter(prefix="/analytics", tags=["Аналитика"])


@router.get(
    "/surveys/{survey_id}",
    response_model=AnalyticsOverview,
    summary="Аналитика по опросу",
    description="Полная аналитика: eNPS, процент прохождения, разбивка по отделам.",
)
async def survey_analytics(
    survey_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr_role),
):
    """Получение аналитики по опросу."""
    try:
        analytics = await get_survey_analytics(db, survey_id)
        return analytics
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.get(
    "/surveys/{survey_id}/export",
    summary="Экспорт ответов",
    description="Экспорт ответов в формате Excel (.xlsx) или CSV.",
)
async def export_survey_responses(
    survey_id: int,
    format: str = "xlsx",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr_role),
):
    """Экспорт ответов опроса в Excel/CSV."""
    # Получаем опрос с вопросами
    result = await db.execute(
        select(Survey)
        .options(selectinload(Survey.questions))
        .where(Survey.id == survey_id)
    )
    survey = result.scalar_one_or_none()

    if not survey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Опрос не найден.",
        )

    # Получаем ответы
    responses_result = await db.execute(
        select(SurveyResponse)
        .options(
            selectinload(SurveyResponse.user),
            selectinload(SurveyResponse.answers),
        )
        .where(
            SurveyResponse.survey_id == survey_id,
            SurveyResponse.completed_at.isnot(None),
        )
        .order_by(SurveyResponse.completed_at)
    )
    responses = list(responses_result.scalars().all())

    # Сортируем вопросы по порядку
    questions = sorted(survey.questions, key=lambda q: q.order_num)

    if format == "csv":
        return _export_csv(survey, questions, responses)
    else:
        return _export_xlsx(survey, questions, responses)


def _export_xlsx(
    survey: Survey,
    questions: list[Question],
    responses: list[SurveyResponse],
) -> StreamingResponse:
    """Экспорт в Excel."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Ответы"

    # Заголовки
    headers = ["№", "Дата ответа"]
    if survey.anonymity.value == "none":
        headers.extend(["Пользователь", "Отдел"])
    elif survey.anonymity.value == "partial":
        headers.append("Отдел")

    for q in questions:
        headers.append(q.text[:50])

    ws.append(headers)

    # Данные
    for idx, response in enumerate(responses, 1):
        row = [idx]
        row.append(
            response.completed_at.strftime("%d.%m.%Y %H:%M")
            if response.completed_at
            else ""
        )

        if survey.anonymity.value == "none" and response.user:
            row.extend([response.user.name or "—", response.user.department or "—"])
        elif survey.anonymity.value == "partial" and response.user:
            row.append(response.user.department or "—")

        # Ответы на вопросы
        answers_map = {a.question_id: a.value for a in response.answers}
        for q in questions:
            val = answers_map.get(q.id, "")
            if isinstance(val, list):
                val = ", ".join(str(v) for v in val)
            elif isinstance(val, dict):
                val = str(val.get("value", val))
            row.append(str(val) if val is not None else "")

        ws.append(row)

    # Автоширина столбцов
    for col in ws.columns:
        max_len = 0
        for cell in col:
            try:
                max_len = max(max_len, len(str(cell.value or "")))
            except Exception:
                pass
        ws.column_dimensions[col[0].column_letter].width = min(max_len + 2, 50)

    # Сохраняем в BytesIO
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    filename = f"survey_{survey.id}_responses_{datetime.now().strftime('%Y%m%d')}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def _export_csv(
    survey: Survey,
    questions: list[Question],
    responses: list[SurveyResponse],
) -> StreamingResponse:
    """Экспорт в CSV."""
    import csv

    output = io.StringIO()
    writer = csv.writer(output, delimiter=";")

    # Заголовки
    headers = ["№", "Дата ответа"]
    if survey.anonymity.value == "none":
        headers.extend(["Пользователь", "Отдел"])
    elif survey.anonymity.value == "partial":
        headers.append("Отдел")

    for q in questions:
        headers.append(q.text[:50])

    writer.writerow(headers)

    # Данные
    for idx, response in enumerate(responses, 1):
        row = [idx]
        row.append(
            response.completed_at.strftime("%d.%m.%Y %H:%M")
            if response.completed_at
            else ""
        )

        if survey.anonymity.value == "none" and response.user:
            row.extend([response.user.name or "—", response.user.department or "—"])
        elif survey.anonymity.value == "partial" and response.user:
            row.append(response.user.department or "—")

        answers_map = {a.question_id: a.value for a in response.answers}
        for q in questions:
            val = answers_map.get(q.id, "")
            if isinstance(val, list):
                val = ", ".join(str(v) for v in val)
            elif isinstance(val, dict):
                val = str(val.get("value", val))
            row.append(str(val) if val is not None else "")

        writer.writerow(row)

    # Преобразуем в bytes
    csv_bytes = output.getvalue().encode("utf-8-sig")
    bytes_io = io.BytesIO(csv_bytes)

    filename = f"survey_{survey.id}_responses_{datetime.now().strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        bytes_io,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get(
    "/dashboard",
    response_model=DashboardOverview,
    summary="Дашборд HR",
    description="Обзорные метрики для дашборда HR.",
)
async def dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr_role),
):
    """Получение данных дашборда."""
    return await get_dashboard_overview(db)
