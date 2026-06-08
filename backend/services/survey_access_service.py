"""Helpers for enforcing survey audience restrictions."""

from fastapi import HTTPException, status

from models.survey import Survey
from models.user import User, UserRole


def user_matches_survey_audience(user: User, survey: Survey) -> bool:
    """Return whether the user belongs to the survey's target audience."""
    if user.role == UserRole.HR:
        return True

    if survey.target_roles and user.role.value not in survey.target_roles:
        return False

    if survey.target_departments:
        if not user.department or user.department not in survey.target_departments:
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
