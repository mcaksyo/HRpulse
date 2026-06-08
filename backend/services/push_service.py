"""
Сервис Web Push уведомлений.
Обёртка над pywebpush с управлением VAPID ключами.
"""

import json
from typing import Optional

from pywebpush import WebPushException, webpush
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models.push_subscription import PushSubscription
from models.user import User


async def send_push_notification(
    subscription_info: dict,
    title: str,
    body: str,
    data: Optional[dict] = None,
) -> bool:
    """
    Отправка Push-уведомления через pywebpush.
    Возвращает True при успехе.
    """
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
        print("⚠️ VAPID ключи не настроены. Push-уведомление не отправлено.")
        print(f"   Заголовок: {title}")
        print(f"   Текст: {body}")
        return False

    payload = json.dumps({
        "title": title,
        "body": body,
        "data": data or {},
        "icon": "/icon-192.png",
        "badge": "/badge-72.png",
    })

    try:
        webpush(
            subscription_info=subscription_info,
            data=payload,
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.VAPID_CLAIMS_EMAIL},
        )
        print(f"✅ Push-уведомление отправлено: {title}")
        return True
    except WebPushException as e:
        print(f"❌ Ошибка Push-уведомления: {e}")
        # Если подписка недействительна (410 Gone), помечаем как неактивную
        if hasattr(e, "response") and e.response and e.response.status_code == 410:
            print("   Подписка недействительна, будет деактивирована")
        return False
    except Exception as e:
        print(f"❌ Неожиданная ошибка Push: {e}")
        return False


async def send_push_to_user(
    user: User,
    title: str,
    body: str,
    data: Optional[dict] = None,
) -> bool:
    """
    Отправка Push-уведомления всем активным подпискам пользователя.
    Возвращает True если хотя бы одна отправка успешна.
    """
    # Получаем подписки из уже загруженного relationship
    subscriptions = [s for s in user.push_subscriptions if s.active]

    if not subscriptions:
        print(f"📭 У пользователя {user.phone} нет активных Push-подписок")
        return False

    success = False
    for sub in subscriptions:
        subscription_info = {
            "endpoint": sub.endpoint,
            "keys": {
                "p256dh": sub.p256dh,
                "auth": sub.auth_key,
            },
        }
        result = await send_push_notification(subscription_info, title, body, data)
        if result:
            success = True

    return success


async def get_user_subscriptions(
    db: AsyncSession, user_id: int
) -> list[PushSubscription]:
    """Получение всех активных подписок пользователя."""
    result = await db.execute(
        select(PushSubscription).where(
            PushSubscription.user_id == user_id,
            PushSubscription.active == True,  # noqa: E712
        )
    )
    return list(result.scalars().all())


async def create_subscription(
    db: AsyncSession,
    user_id: int,
    endpoint: str,
    p256dh: str,
    auth_key: str,
    device_name: Optional[str] = None,
) -> PushSubscription:
    """Создание или обновление подписки на Push-уведомления."""
    # Проверяем, нет ли уже такой подписки
    result = await db.execute(
        select(PushSubscription).where(
            PushSubscription.user_id == user_id,
            PushSubscription.endpoint == endpoint,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        # Обновляем ключи
        existing.p256dh = p256dh
        existing.auth_key = auth_key
        existing.active = True
        if device_name:
            existing.device_name = device_name
        await db.flush()
        return existing

    # Создаём новую подписку
    subscription = PushSubscription(
        user_id=user_id,
        endpoint=endpoint,
        p256dh=p256dh,
        auth_key=auth_key,
        device_name=device_name,
    )
    db.add(subscription)
    await db.flush()
    await db.refresh(subscription)
    return subscription


async def deactivate_subscription(
    db: AsyncSession, subscription_id: int, user_id: int
) -> bool:
    """Деактивация подписки."""
    result = await db.execute(
        select(PushSubscription).where(
            PushSubscription.id == subscription_id,
            PushSubscription.user_id == user_id,
        )
    )
    subscription = result.scalar_one_or_none()
    if not subscription:
        return False

    subscription.active = False
    await db.flush()
    return True
