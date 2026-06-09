"""
Роутер опросов.
CRUD, публикация, получение доступных опросов.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models.response import SurveyResponse
from models.survey import Survey, SurveyStatus
from models.user import User, UserRole
from schemas.survey import (
    SurveyCreate,
    SurveyListItem,
    SurveyListResponse,
    SurveyResponse as SurveyResponseSchema,
    SurveyUpdate,
)
from services.auth_service import get_current_user, require_hr_role
from services.survey_access_service import (
    ensure_user_can_access_survey,
    user_matches_survey_audience,
)

router = APIRouter(prefix="/surveys", tags=["Опросы"])
EDITABLE_SURVEY_STATUSES = (
    SurveyStatus.DRAFT,
    SurveyStatus.PUBLISHED,
    SurveyStatus.ACTIVE,
)


@router.post(
    "/",
    response_model=SurveyResponseSchema,
    status_code=status.HTTP_201_CREATED,
    summary="Создание опроса",
    description="Создание нового опроса. Доступно только для HR.",
)
async def create_survey(
    data: SurveyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr_role),
):
    """Создание нового опроса."""
    survey = Survey(
        created_by=current_user.id,
        title=data.title,
        description=data.description,
        anonymity=data.anonymity,
        target_roles=data.target_roles,
        target_departments=data.target_departments,
        starts_at=data.starts_at,
        ends_at=data.ends_at,
        estimated_minutes=data.estimated_minutes,
    )
    db.add(survey)
    await db.flush()
    await db.refresh(survey, attribute_names=["questions", "responses"])

    result = SurveyResponseSchema.model_validate(survey)
    result.responses_count = 0
    return result


@router.get(
    "/",
    response_model=SurveyListResponse,
    summary="Список опросов",
    description="Получение списка опросов с пагинацией. HR видит все, сотрудники — только опубликованные.",
)
async def list_surveys(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status_filter: Optional[SurveyStatus] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Получение списка опросов."""
    is_hr = current_user.role == UserRole.HR
    query = select(Survey).options(selectinload(Survey.responses))

    # Фильтр по статусу
    if not is_hr and status_filter and status_filter not in (
        SurveyStatus.PUBLISHED,
        SurveyStatus.ACTIVE,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Сотрудники могут просматривать только опубликованные опросы.",
        )

    if status_filter:
        query = query.where(Survey.status == status_filter)
    elif not is_hr:
        # Сотрудники видят только опубликованные/активные
        query = query.where(
            Survey.status.in_([SurveyStatus.PUBLISHED, SurveyStatus.ACTIVE])
        )

    query = query.order_by(Survey.created_at.desc())

    if is_hr:
        count_query = select(func.count()).select_from(query.subquery())
        total = await db.scalar(count_query) or 0
        query = query.offset((page - 1) * per_page).limit(per_page)
        result = await db.execute(query)
        surveys = list(result.scalars().all())
    else:
        result = await db.execute(query)
        filtered_surveys = [
            survey
            for survey in result.scalars().all()
            if user_matches_survey_audience(current_user, survey)
        ]
        total = len(filtered_surveys)
        start = (page - 1) * per_page
        end = start + per_page
        surveys = filtered_surveys[start:end]

    items = []
    for s in surveys:
        item = SurveyListItem.model_validate(s)
        item.responses_count = len([
            r for r in s.responses if r.completed_at is not None
        ])
        items.append(item)

    return SurveyListResponse(
        items=items, total=total, page=page, per_page=per_page
    )


@router.get(
    "/available",
    response_model=SurveyListResponse,
    summary="Доступные опросы",
    description="Опросы, доступные текущему сотруднику для прохождения.",
)
async def available_surveys(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Получение доступных опросов для текущего пользователя."""
    now = datetime.now(timezone.utc)

    query = (
        select(Survey)
        .options(selectinload(Survey.responses))
        .where(
            Survey.status.in_([SurveyStatus.PUBLISHED, SurveyStatus.ACTIVE]),
        )
    )

    # Фильтрация по времени
    query = query.where(
        (Survey.starts_at.is_(None)) | (Survey.starts_at <= now)
    )
    query = query.where(
        (Survey.ends_at.is_(None)) | (Survey.ends_at >= now)
    )

    query = query.order_by(Survey.created_at.desc())

    result = await db.execute(query)
    visible_surveys = [
        survey
        for survey in result.scalars().all()
        if user_matches_survey_audience(current_user, survey)
    ]
    total = len(visible_surveys)
    start = (page - 1) * per_page
    end = start + per_page
    surveys = visible_surveys[start:end]

    items = []
    for s in surveys:
        # Проверяем, не прошёл ли уже текущий пользователь
        item = SurveyListItem.model_validate(s)
        item.responses_count = len([
            r for r in s.responses if r.completed_at is not None
        ])
        items.append(item)

    return SurveyListResponse(
        items=items, total=total, page=page, per_page=per_page
    )


@router.get(
    "/{survey_id}",
    response_model=SurveyResponseSchema,
    summary="Получение опроса",
    description="Получение полной информации об опросе с вопросами.",
)
async def get_survey(
    survey_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Получение опроса по ID."""
    result = await db.execute(
        select(Survey)
        .options(
            selectinload(Survey.questions),
            selectinload(Survey.responses),
        )
        .where(Survey.id == survey_id)
    )
    survey = result.scalar_one_or_none()

    if not survey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Опрос не найден.",
        )

    # Сотрудники не видят черновики
    if (
        current_user.role != UserRole.HR
        and survey.status == SurveyStatus.DRAFT
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Опрос ещё не опубликован.",
        )
    ensure_user_can_access_survey(current_user, survey)

    response = SurveyResponseSchema.model_validate(survey)
    response.responses_count = len([
        r for r in survey.responses if r.completed_at is not None
    ])
    return response


@router.post(
    "/{survey_id}/archive",
    response_model=SurveyResponseSchema,
    summary="Архивация опроса",
    description="Скрывает опрос из доступа сотрудников, оставляя его в HR-архиве.",
)
async def archive_survey(
    survey_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr_role),
):
    """Archive a survey."""
    result = await db.execute(
        select(Survey)
        .options(selectinload(Survey.questions), selectinload(Survey.responses))
        .where(Survey.id == survey_id)
    )
    survey = result.scalar_one_or_none()

    if not survey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Опрос не найден.",
        )

    if survey.status == SurveyStatus.ARCHIVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Опрос уже находится в архиве.",
        )

    survey.status = SurveyStatus.ARCHIVED
    now = datetime.now(timezone.utc)
    if not survey.ends_at or survey.ends_at > now:
        survey.ends_at = now

    await db.flush()
    await db.refresh(survey)

    response = SurveyResponseSchema.model_validate(survey)
    response.responses_count = len([
        r for r in survey.responses if r.completed_at is not None
    ])
    return response


@router.put(
    "/{survey_id}",
    response_model=SurveyResponseSchema,
    summary="Обновление опроса",
    description="Обновление опроса. Доступно только для HR для черновиков, опубликованных и активных опросов.",
)
async def update_survey(
    survey_id: int,
    data: SurveyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr_role),
):
    """Обновление опроса."""
    result = await db.execute(
        select(Survey)
        .options(selectinload(Survey.questions), selectinload(Survey.responses))
        .where(Survey.id == survey_id)
    )
    survey = result.scalar_one_or_none()

    if not survey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Опрос не найден.",
        )

    if survey.status not in EDITABLE_SURVEY_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Можно редактировать только черновики, опубликованные или активные опросы.",
        )

    # Обновляем только переданные поля
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(survey, field, value)

    await db.flush()
    await db.refresh(survey)

    response = SurveyResponseSchema.model_validate(survey)
    response.responses_count = len([
        r for r in survey.responses if r.completed_at is not None
    ])
    return response


@router.delete(
    "/{survey_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удаление опроса",
    description="Удаление опроса. Доступно только для HR.",
)
async def delete_survey(
    survey_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr_role),
):
    """Удаление опроса."""
    result = await db.execute(
        select(Survey).where(Survey.id == survey_id)
    )
    survey = result.scalar_one_or_none()

    if not survey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Опрос не найден.",
        )

    await db.delete(survey)
    await db.flush()


@router.post(
    "/{survey_id}/publish",
    response_model=SurveyResponseSchema,
    summary="Публикация опроса",
    description="Публикация черновика опроса. Отправляет уведомления сотрудникам.",
)
async def publish_survey(
    survey_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr_role),
):
    """Публикация опроса."""
    result = await db.execute(
        select(Survey)
        .options(selectinload(Survey.questions), selectinload(Survey.responses))
        .where(Survey.id == survey_id)
    )
    survey = result.scalar_one_or_none()

    if not survey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Опрос не найден.",
        )

    if survey.status != SurveyStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Можно опубликовать только черновик.",
        )

    if not survey.questions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя опубликовать опрос без вопросов.",
        )

    survey.status = SurveyStatus.PUBLISHED
    if not survey.starts_at:
        survey.starts_at = datetime.now(timezone.utc)

    await db.flush()
    await db.commit()
    await db.refresh(survey)

    try:
        from tasks.notification_tasks import send_survey_notifications

        send_survey_notifications.delay(survey.id)
    except Exception as e:
        print(f"⚠️ Failed to enqueue survey notifications: {e}")

    response = SurveyResponseSchema.model_validate(survey)
    response.responses_count = 0
    return response


@router.post(
    "/{survey_id}/close",
    response_model=SurveyResponseSchema,
    summary="Закрытие опроса",
    description="Закрытие опроса. Прекращает приём ответов.",
)
async def close_survey(
    survey_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr_role),
):
    """Закрытие опроса."""
    result = await db.execute(
        select(Survey)
        .options(selectinload(Survey.questions), selectinload(Survey.responses))
        .where(Survey.id == survey_id)
    )
    survey = result.scalar_one_or_none()

    if not survey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Опрос не найден.",
        )

    if survey.status not in (SurveyStatus.PUBLISHED, SurveyStatus.ACTIVE):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Можно закрыть только опубликованный или активный опрос.",
        )

    survey.status = SurveyStatus.CLOSED
    survey.ends_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(survey)

    response = SurveyResponseSchema.model_validate(survey)
    response.responses_count = len([
        r for r in survey.responses if r.completed_at is not None
    ])
    return response
