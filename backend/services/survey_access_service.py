"""Helpers for enforcing survey audience restrictions."""

from fastapi import HTTPException, status

from models.survey import Survey
from models.user import User, UserRole


def normalize_target_values(values: list | None) -> list[str]:
    """Return a stripped list of non-empty audience values."""

    if not values:
        return []

    normalized = []
    for value in values:
        item = str(value).strip()
        if item:
            normalized.append(item)

    return normalized


def user_matches_survey_audience(user: User, survey: Survey) -> bool:
    """Return whether the user belongs to the survey's target audience."""
    if user.role == UserRole.HR:
        return True

    target_roles = normalize_target_values(survey.target_roles)
    target_departments = normalize_target_values(survey.target_departments)

    if target_roles and user.role.value not in target_roles:
        return False

    if target_departments:
        if not user.department or user.department not in target_departments:
            return False

    return True


def ensure_user_can_access_survey(user: User, survey: Survey) -> None:
    """Raise 403 when the user is outside the target audience."""
    if user.role == UserRole.HR:
        return

    if not user_matches_survey_audience(user, survey):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This survey is not available for your role or department.",
        )
