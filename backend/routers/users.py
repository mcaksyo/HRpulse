"""
Роутер пользователей.
Профиль, список пользователей (для HR).
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.user import User, UserRole
from schemas.auth import UserListResponse, UserResponse, UserUpdate
from services.auth_service import get_current_user, require_hr_role

router = APIRouter(prefix="/users", tags=["Пользователи"])


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Мой профиль",
    description="Получение профиля текущего пользователя.",
)
async def get_profile(
    current_user: User = Depends(get_current_user),
):
    """Получение профиля."""
    return UserResponse.model_validate(current_user)


@router.put(
    "/me",
    response_model=UserResponse,
    summary="Обновление профиля",
    description="Обновление профиля текущего пользователя.",
)
async def update_profile(
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Обновление профиля."""
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(current_user, field, value)

    await db.flush()
    await db.refresh(current_user)

    return UserResponse.model_validate(current_user)


@router.get(
    "/",
    response_model=UserListResponse,
    summary="Список пользователей",
    description="Получение списка пользователей. Доступно только для HR.",
)
async def list_users(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    department: str | None = Query(None),
    role: UserRole | None = Query(None),
    search: str | None = Query(None, description="Поиск по имени или телефону"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr_role),
):
    """Список пользователей (для HR)."""
    query = select(User).where(User.is_active == True)  # noqa: E712

    # Фильтры
    if department:
        query = query.where(User.department == department)
    if role:
        query = query.where(User.role == role)
    if search:
        query = query.where(
            (User.name.ilike(f"%{search}%")) | (User.phone.ilike(f"%{search}%"))
        )

    # Подсчёт
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query) or 0

    # Пагинация
    query = query.order_by(User.created_at.desc())
    query = query.offset((page - 1) * per_page).limit(per_page)

    result = await db.execute(query)
    users = list(result.scalars().all())

    return UserListResponse(
        items=[UserResponse.model_validate(u) for u in users],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get(
    "/{user_id}",
    response_model=UserResponse,
    summary="Получение пользователя",
    description="Получение информации о пользователе по ID. Доступно только для HR.",
)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr_role),
):
    """Получение пользователя по ID."""
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден.",
        )

    return UserResponse.model_validate(user)


@router.put(
    "/{user_id}/role",
    response_model=UserResponse,
    summary="Изменение роли пользователя",
    description="Изменение роли пользователя. Доступно только для HR.",
)
async def change_user_role(
    user_id: int,
    role: UserRole,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr_role),
):
    """Изменение роли пользователя."""
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден.",
        )

    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя изменить свою собственную роль.",
        )

    user.role = role
    await db.flush()
    await db.refresh(user)

    return UserResponse.model_validate(user)
