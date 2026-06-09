"""Survey response routes."""

import hashlib
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models.answer import Answer
from models.response import SurveyResponse
from models.survey import AnonymityMode, Survey, SurveyStatus
from models.user import User
from schemas.response import (
    AnswerResponse,
    ResponseListItem,
    ResponseStatus,
    SurveySubmission,
)
from services.auth_service import get_current_user, require_hr_role
from services.survey_access_service import ensure_user_can_access_survey

router = APIRouter(prefix="/surveys/{survey_id}", tags=["Responses"])


def build_anonymous_token(user_id: int, survey_id: int) -> str:
    """Build a stable token for duplicate detection in full-anonymous mode."""
    return hashlib.sha256(f"{user_id}:{survey_id}".encode()).hexdigest()


@router.post(
    "/respond",
    response_model=ResponseStatus,
    status_code=status.HTTP_201_CREATED,
    summary="Submit survey response",
    description="Submit survey answers with duplicate protection.",
)
async def submit_response(
    survey_id: int,
    data: SurveySubmission,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit answers for a survey."""
    result = await db.execute(
        select(Survey)
        .options(selectinload(Survey.questions))
        .where(Survey.id == survey_id)
    )
    survey = result.scalar_one_or_none()

    if not survey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Survey not found.",
        )

    if survey.status not in (SurveyStatus.PUBLISHED, SurveyStatus.ACTIVE):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Survey is not accepting responses.",
        )
    ensure_user_can_access_survey(current_user, survey)

    now = datetime.now(timezone.utc)
    if survey.ends_at and survey.ends_at < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Survey deadline has passed.",
        )

    anonymous_token = None
    existing_query = select(SurveyResponse).where(
        SurveyResponse.survey_id == survey_id
    )
    if survey.anonymity == AnonymityMode.FULL:
        anonymous_token = build_anonymous_token(current_user.id, survey_id)
        existing_query = existing_query.where(
            SurveyResponse.anonymous_token == anonymous_token
        )
    else:
        existing_query = existing_query.where(
            SurveyResponse.user_id == current_user.id
        )

    existing = await db.execute(existing_query)
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already completed this survey.",
        )

    question_ids = {question.id for question in survey.questions}
    required_ids = {question.id for question in survey.questions if question.required}
    submitted_ids = {answer.question_id for answer in data.answers}

    missing_required = required_ids - submitted_ids
    if missing_required:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing required questions: {missing_required}",
        )

    invalid_ids = submitted_ids - question_ids
    if invalid_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Questions do not belong to this survey: {invalid_ids}",
        )

    user_id_for_response = current_user.id
    if survey.anonymity == AnonymityMode.FULL:
        user_id_for_response = None

    survey_response = SurveyResponse(
        survey_id=survey_id,
        user_id=user_id_for_response,
        anonymous_token=anonymous_token,
        started_at=now,
        completed_at=now,
    )
    db.add(survey_response)
    await db.flush()

    for answer_input in data.answers:
        db.add(
            Answer(
                response_id=survey_response.id,
                question_id=answer_input.question_id,
                value=answer_input.value,
            )
        )

    await db.flush()
    await db.refresh(survey_response, attribute_names=["answers"])

    return ResponseStatus(
        id=survey_response.id,
        survey_id=survey_response.survey_id,
        user_id=survey_response.user_id,
        started_at=survey_response.started_at,
        completed_at=survey_response.completed_at,
        answers=[
            AnswerResponse.model_validate(answer)
            for answer in survey_response.answers
        ],
    )


@router.get(
    "/my-response",
    response_model=Optional[ResponseStatus],
    summary="Get my response",
    description="Return the current user's response for a survey.",
)
async def get_my_response(
    survey_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the current user's response for a survey."""
    survey_result = await db.execute(select(Survey).where(Survey.id == survey_id))
    survey = survey_result.scalar_one_or_none()

    if not survey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Survey not found.",
        )
    ensure_user_can_access_survey(current_user, survey)

    response_query = (
        select(SurveyResponse)
        .options(selectinload(SurveyResponse.answers))
        .where(SurveyResponse.survey_id == survey_id)
    )
    if survey.anonymity == AnonymityMode.FULL:
        response_query = response_query.where(
            SurveyResponse.anonymous_token == build_anonymous_token(
                current_user.id,
                survey_id,
            )
        )
    else:
        response_query = response_query.where(
            SurveyResponse.user_id == current_user.id
        )

    result = await db.execute(response_query)
    response = result.scalar_one_or_none()

    if not response:
        return None

    return ResponseStatus(
        id=response.id,
        survey_id=response.survey_id,
        user_id=response.user_id,
        started_at=response.started_at,
        completed_at=response.completed_at,
        answers=[AnswerResponse.model_validate(answer) for answer in response.answers],
    )


@router.get(
    "/responses",
    response_model=list[ResponseListItem],
    summary="List survey responses",
    description="Return all responses for an HR user.",
)
async def list_responses(
    survey_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr_role),
):
    """Return all responses for a survey for HR users."""
    survey_result = await db.execute(select(Survey).where(Survey.id == survey_id))
    survey = survey_result.scalar_one_or_none()

    if not survey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Survey not found.",
        )

    result = await db.execute(
        select(SurveyResponse)
        .options(
            selectinload(SurveyResponse.user),
            selectinload(SurveyResponse.answers),
        )
        .where(SurveyResponse.survey_id == survey_id)
        .order_by(SurveyResponse.completed_at.desc())
    )
    responses = list(result.scalars().all())

    items: list[ResponseListItem] = []
    for response in responses:
        user_name = None
        user_department = None

        if survey.anonymity == AnonymityMode.NONE and response.user:
            user_name = response.user.name
            user_department = response.user.department
        elif survey.anonymity == AnonymityMode.PARTIAL and response.user:
            user_department = response.user.department

        items.append(
            ResponseListItem(
                id=response.id,
                survey_id=response.survey_id,
                user_id=(
                    response.user_id
                    if survey.anonymity != AnonymityMode.FULL
                    else None
                ),
                user_name=user_name,
                user_department=user_department,
                started_at=response.started_at,
                completed_at=response.completed_at,
                answers_count=len(response.answers),
            )
        )

    return items
