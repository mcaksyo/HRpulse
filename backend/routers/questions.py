"""
Роутер вопросов.
CRUD вопросов для опроса, изменение порядка, правила ветвления.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models.question import Question
from models.survey import Survey, SurveyStatus
from models.user import User, UserRole
from schemas.question import (
    QuestionCreate,
    QuestionReorder,
    QuestionResponse,
    QuestionUpdate,
)
from services.auth_service import get_current_user, require_hr_role
from services.survey_access_service import ensure_user_can_access_survey

router = APIRouter(prefix="/surveys/{survey_id}/questions", tags=["Вопросы"])


async def _get_survey_or_404(
    db: AsyncSession, survey_id: int
) -> Survey:
    """Получение опроса или 404."""
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
    return survey


@router.get(
    "/",
    response_model=list[QuestionResponse],
    summary="Список вопросов",
    description="Получение всех вопросов опроса.",
)
async def list_questions(
    survey_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Получение списка вопросов опроса."""
    survey = await _get_survey_or_404(db, survey_id)

    # Сотрудники не видят вопросы черновиков
    if current_user.role != UserRole.HR and survey.status == SurveyStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Опрос ещё не опубликован.",
        )
    ensure_user_can_access_survey(current_user, survey)

    return [QuestionResponse.model_validate(q) for q in survey.questions]


@router.post(
    "/",
    response_model=QuestionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Создание вопроса",
    description="Добавление вопроса в опрос. Доступно только для HR.",
)
async def create_question(
    survey_id: int,
    data: QuestionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr_role),
):
    """Создание нового вопроса."""
    survey = await _get_survey_or_404(db, survey_id)

    if survey.status != SurveyStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Можно добавлять вопросы только в черновик.",
        )

    # Определяем порядковый номер
    if data.order_num == 0:
        max_order = max((q.order_num for q in survey.questions), default=-1)
        data.order_num = max_order + 1

    # Подготовка branch_rules
    branch_rules_data = None
    if data.branch_rules:
        branch_rules_data = [rule.model_dump() for rule in data.branch_rules]

    question = Question(
        survey_id=survey_id,
        order_num=data.order_num,
        text=data.text,
        type=data.type,
        options=data.options,
        branch_rules=branch_rules_data,
        scale_min=data.scale_min,
        scale_max=data.scale_max,
        scale_min_label=data.scale_min_label,
        scale_max_label=data.scale_max_label,
        required=data.required,
    )
    db.add(question)
    await db.flush()
    await db.refresh(question)

    return QuestionResponse.model_validate(question)


@router.get(
    "/{question_id}",
    response_model=QuestionResponse,
    summary="Получение вопроса",
)
async def get_question(
    survey_id: int,
    question_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Получение вопроса по ID."""
    result = await db.execute(
        select(Question).where(
            Question.id == question_id,
            Question.survey_id == survey_id,
        )
    )
    question = result.scalar_one_or_none()

    if not question:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Вопрос не найден.",
        )

    survey = await _get_survey_or_404(db, survey_id)
    if current_user.role != UserRole.HR and survey.status == SurveyStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Опрос ещё не опубликован.",
        )
    ensure_user_can_access_survey(current_user, survey)

    return QuestionResponse.model_validate(question)


@router.put(
    "/{question_id}",
    response_model=QuestionResponse,
    summary="Обновление вопроса",
    description="Обновление вопроса. Доступно только для HR.",
)
async def update_question(
    survey_id: int,
    question_id: int,
    data: QuestionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr_role),
):
    """Обновление вопроса."""
    survey = await _get_survey_or_404(db, survey_id)

    if survey.status != SurveyStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Можно редактировать вопросы только в черновике.",
        )

    result = await db.execute(
        select(Question).where(
            Question.id == question_id,
            Question.survey_id == survey_id,
        )
    )
    question = result.scalar_one_or_none()

    if not question:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Вопрос не найден.",
        )

    update_data = data.model_dump(exclude_unset=True)

    # Обработка branch_rules
    if "branch_rules" in update_data and update_data["branch_rules"] is not None:
        update_data["branch_rules"] = [
            rule.model_dump() if hasattr(rule, "model_dump") else rule
            for rule in update_data["branch_rules"]
        ]

    for field, value in update_data.items():
        setattr(question, field, value)

    await db.flush()
    await db.refresh(question)

    return QuestionResponse.model_validate(question)


@router.delete(
    "/{question_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удаление вопроса",
)
async def delete_question(
    survey_id: int,
    question_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr_role),
):
    """Удаление вопроса."""
    survey = await _get_survey_or_404(db, survey_id)

    if survey.status != SurveyStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Можно удалять вопросы только из черновика.",
        )

    result = await db.execute(
        select(Question).where(
            Question.id == question_id,
            Question.survey_id == survey_id,
        )
    )
    question = result.scalar_one_or_none()

    if not question:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Вопрос не найден.",
        )

    await db.delete(question)
    await db.flush()


@router.post(
    "/reorder",
    response_model=list[QuestionResponse],
    summary="Изменение порядка вопросов",
    description="Установка нового порядка вопросов в опросе.",
)
async def reorder_questions(
    survey_id: int,
    data: QuestionReorder,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr_role),
):
    """Изменение порядка вопросов."""
    survey = await _get_survey_or_404(db, survey_id)

    if survey.status != SurveyStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Можно менять порядок только в черновике.",
        )

    # Проверяем, что все ID принадлежат этому опросу
    question_ids_in_survey = {q.id for q in survey.questions}
    if set(data.question_ids) != question_ids_in_survey:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Список ID вопросов не совпадает с вопросами опроса.",
        )

    # Обновляем порядок
    for order, question_id in enumerate(data.question_ids):
        result = await db.execute(
            select(Question).where(Question.id == question_id)
        )
        question = result.scalar_one()
        question.order_num = order

    await db.flush()

    # Возвращаем обновлённый список
    result = await db.execute(
        select(Question)
        .where(Question.survey_id == survey_id)
        .order_by(Question.order_num)
    )
    questions = list(result.scalars().all())

    return [QuestionResponse.model_validate(q) for q in questions]
