"""
Роутер уведомлений.
Push-подписки, настройки уведомлений, история.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.notification import Notification
from models.notification_preference import NotificationPreference
from models.push_subscription import PushSubscription
from models.user import User
from schemas.notification import (
    NotificationHistoryResponse,
    NotificationPreferenceResponse,
    NotificationPreferenceUpdate,
    NotificationResponse,
    PushSubscriptionCreate,
    PushSubscriptionResponse,
)
from services.auth_service import get_current_user
from services.push_service import create_subscription, deactivate_subscription

router = APIRouter(prefix="/notifications", tags=["Уведомления"])


# === Push-подписки ===


@router.post(
    "/push/subscribe",
    response_model=PushSubscriptionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Подписка на Push-уведомления",
    description="Регистрация подписки на Web Push для текущего устройства.",
)
async def subscribe_push(
    data: PushSubscriptionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Регистрация Push-подписки."""
    subscription = await create_subscription(
        db=db,
        user_id=current_user.id,
        endpoint=data.endpoint,
        p256dh=data.p256dh,
        auth_key=data.auth_key,
        device_name=data.device_name,
    )
    return PushSubscriptionResponse.model_validate(subscription)


@router.get(
    "/push/subscriptions",
    response_model=list[PushSubscriptionResponse],
    summary="Мои Push-подписки",
    description="Список активных Push-подписок текущего пользователя.",
)
async def list_push_subscriptions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Список Push-подписок."""
    result = await db.execute(
        select(PushSubscription).where(
            PushSubscription.user_id == current_user.id,
            PushSubscription.active == True,  # noqa: E712
        )
    )
    subscriptions = list(result.scalars().all())
    return [PushSubscriptionResponse.model_validate(s) for s in subscriptions]


@router.delete(
    "/push/subscriptions/{subscription_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Отписка от Push-уведомлений",
    description="Деактивация Push-подписки.",
)
async def unsubscribe_push(
    subscription_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Деактивация Push-подписки."""
    success = await deactivate_subscription(db, subscription_id, current_user.id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Подписка не найдена.",
        )


# === Предпочтения уведомлений ===


@router.get(
    "/preferences",
    response_model=NotificationPreferenceResponse,
    summary="Мои предпочтения уведомлений",
    description="Получение настроек уведомлений.",
)
async def get_preferences(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Получение предпочтений уведомлений."""
    result = await db.execute(
        select(NotificationPreference).where(
            NotificationPreference.user_id == current_user.id
        )
    )
    pref = result.scalar_one_or_none()

    if not pref:
        # Создаём с настройками по умолчанию
        pref = NotificationPreference(user_id=current_user.id)
        db.add(pref)
        await db.flush()
        await db.refresh(pref)

    return NotificationPreferenceResponse.model_validate(pref)


@router.put(
    "/preferences",
    response_model=NotificationPreferenceResponse,
    summary="Обновление предпочтений",
    description="Обновление настроек уведомлений.",
)
async def update_preferences(
    data: NotificationPreferenceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Обновление предпочтений уведомлений."""
    result = await db.execute(
        select(NotificationPreference).where(
            NotificationPreference.user_id == current_user.id
        )
    )
    pref = result.scalar_one_or_none()

    if not pref:
        pref = NotificationPreference(user_id=current_user.id)
        db.add(pref)
        await db.flush()

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(pref, field, value)

    await db.flush()
    await db.refresh(pref)

    return NotificationPreferenceResponse.model_validate(pref)


# === История уведомлений ===


@router.get(
    "/history",
    response_model=NotificationHistoryResponse,
    summary="История уведомлений",
    description="Получение истории уведомлений текущего пользователя.",
)
async def notification_history(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Получение истории уведомлений."""
    # Подсчёт
    total = await db.scalar(
        select(func.count(Notification.id)).where(
            Notification.user_id == current_user.id
        )
    ) or 0

    # Выборка с пагинацией
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    notifications = list(result.scalars().all())

    return NotificationHistoryResponse(
        items=[NotificationResponse.model_validate(n) for n in notifications],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post(
    "/{notification_id}/opened",
    summary="Отметка об открытии",
    description="Фиксация открытия уведомления.",
)
async def mark_opened(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Отметка уведомления как открытого."""
    from datetime import datetime, timezone
    from models.notification import NotificationStatus

    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
    )
    notification = result.scalar_one_or_none()

    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Уведомление не найдено.",
        )

    notification.status = NotificationStatus.OPENED
    notification.opened_at = datetime.now(timezone.utc)
    await db.flush()

    return {"message": "Уведомление отмечено как открытое"}


@router.post(
    "/{notification_id}/clicked",
    summary="Отметка о клике",
    description="Фиксация клика по уведомлению.",
)
async def mark_clicked(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Отметка уведомления как кликнутого."""
    from datetime import datetime, timezone
    from models.notification import NotificationStatus

    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
    )
    notification = result.scalar_one_or_none()

    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Уведомление не найдено.",
        )

    notification.status = NotificationStatus.CLICKED
    notification.clicked_at = datetime.now(timezone.utc)
    if not notification.opened_at:
        notification.opened_at = datetime.now(timezone.utc)
    await db.flush()

    return {"message": "Уведомление отмечено как кликнутое"}
