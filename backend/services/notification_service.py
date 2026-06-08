"""
Сервис уведомлений.
Каскадная логика: Web Push → SMS → Email.
Rate limiting, дедупликация, абстрактный интерфейс для каналов.
"""

from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Optional

import redis.asyncio as redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models.notification import Notification, NotificationChannel, NotificationStatus
from models.notification_preference import NotificationPreference
from models.push_subscription import PushSubscription
from models.user import User

# Redis клиент для rate limiting
redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)


class NotificationChannelInterface(ABC):
    """Абстрактный интерфейс канала уведомлений."""

    @abstractmethod
    async def send(
        self,
        user: User,
        title: str,
        body: str,
        data: Optional[dict] = None,
    ) -> bool:
        """Отправка уведомления. Возвращает True при успехе."""
        ...

    @abstractmethod
    def get_channel_type(self) -> NotificationChannel:
        """Возвращает тип канала."""
        ...

    @abstractmethod
    def get_cost(self) -> float:
        """Стоимость одного уведомления."""
        ...


class WebPushChannel(NotificationChannelInterface):
    """Канал Web Push уведомлений."""

    async def send(
        self,
        user: User,
        title: str,
        body: str,
        data: Optional[dict] = None,
    ) -> bool:
        """Отправка Web Push уведомления."""
        from services.push_service import send_push_to_user
        return await send_push_to_user(user, title, body, data)

    def get_channel_type(self) -> NotificationChannel:
        return NotificationChannel.WEB_PUSH

    def get_cost(self) -> float:
        return 0.0


class SMSChannel(NotificationChannelInterface):
    """Канал SMS-уведомлений (мок в MVP)."""

    async def send(
        self,
        user: User,
        title: str,
        body: str,
        data: Optional[dict] = None,
    ) -> bool:
        """Мок отправки SMS — логирование в консоль."""
        from services.sms_service import send_sms
        return await send_sms(user.phone, f"{title}: {body}")

    def get_channel_type(self) -> NotificationChannel:
        return NotificationChannel.SMS

    def get_cost(self) -> float:
        return 2.5  # Стоимость в рублях


class EmailChannel(NotificationChannelInterface):
    """Канал Email-уведомлений (мок в MVP)."""

    async def send(
        self,
        user: User,
        title: str,
        body: str,
        data: Optional[dict] = None,
    ) -> bool:
        """Мок отправки Email — логирование в консоль."""
        print(f"\n📧 [EMAIL МОК] Кому: {user.phone}")
        print(f"   Тема: {title}")
        print(f"   Тело: {body}\n")
        return True

    def get_channel_type(self) -> NotificationChannel:
        return NotificationChannel.EMAIL

    def get_cost(self) -> float:
        return 0.5


class TelegramChannel(NotificationChannelInterface):
    """Канал Telegram-уведомлений (заглушка для будущей интеграции)."""

    async def send(
        self,
        user: User,
        title: str,
        body: str,
        data: Optional[dict] = None,
    ) -> bool:
        """Заглушка для Telegram бота."""
        print(f"\n🤖 [TELEGRAM МОК] Кому: {user.phone}")
        print(f"   Сообщение: {title} - {body}\n")
        return False  # Пока не реализовано

    def get_channel_type(self) -> NotificationChannel:
        return NotificationChannel.TELEGRAM

    def get_cost(self) -> float:
        return 0.0


# Реестр каналов уведомлений
CHANNELS: dict[NotificationChannel, NotificationChannelInterface] = {
    NotificationChannel.WEB_PUSH: WebPushChannel(),
    NotificationChannel.SMS: SMSChannel(),
    NotificationChannel.EMAIL: EmailChannel(),
    NotificationChannel.TELEGRAM: TelegramChannel(),
}


async def check_rate_limit(user_id: int) -> bool:
    """Проверка лимита уведомлений в день (5/день)."""
    rate_key = f"notif_rate:{user_id}:{datetime.now(timezone.utc).strftime('%Y-%m-%d')}"
    count = await redis_client.get(rate_key)
    if count and int(count) >= settings.MAX_NOTIFICATIONS_PER_DAY:
        return False
    return True


async def increment_rate_limit(user_id: int) -> None:
    """Увеличение счётчика уведомлений за день."""
    rate_key = f"notif_rate:{user_id}:{datetime.now(timezone.utc).strftime('%Y-%m-%d')}"
    pipe = redis_client.pipeline()
    pipe.incr(rate_key)
    pipe.expire(rate_key, 86400)  # 24 часа
    await pipe.execute()


async def check_deduplication(
    user_id: int, survey_id: int, channel: str
) -> bool:
    """Проверка дедупликации: не отправлять повторно по тому же каналу."""
    dedup_key = f"notif_dedup:{user_id}:{survey_id}:{channel}"
    if await redis_client.exists(dedup_key):
        return False  # Уже отправляли
    # Устанавливаем флаг на 24 часа
    await redis_client.setex(dedup_key, 86400, "1")
    return True


async def get_user_preferences(
    db: AsyncSession, user_id: int
) -> Optional[NotificationPreference]:
    """Получение предпочтений уведомлений пользователя."""
    result = await db.execute(
        select(NotificationPreference).where(
            NotificationPreference.user_id == user_id
        )
    )
    return result.scalar_one_or_none()


async def send_cascade_notification(
    db: AsyncSession,
    user: User,
    survey_id: int,
    title: str,
    body: str,
    data: Optional[dict] = None,
) -> Optional[Notification]:
    """
    Каскадная отправка уведомлений.
    Порядок: Web Push → SMS → Email.
    Останавливается при первом успешном канале.
    """
    # Проверка DND
    if user.dnd_mode:
        if user.dnd_until and user.dnd_until > datetime.now(timezone.utc):
            print(f"🔇 Пользователь {user.phone} в DND режиме до {user.dnd_until}")
            return None
    
    # Проверка согласия на уведомления
    if not user.consent_notifications:
        print(f"🚫 Пользователь {user.phone} отказался от уведомлений")
        return None

    # Проверка rate limit
    if not await check_rate_limit(user.id):
        print(f"⚠️ Превышен лимит уведомлений для {user.phone}")
        return None

    # Получаем предпочтения
    prefs = await get_user_preferences(db, user.id)

    # Определяем порядок каналов с учётом предпочтений
    cascade_order = []
    if not prefs or prefs.web_push_enabled:
        cascade_order.append(NotificationChannel.WEB_PUSH)
    if not prefs or prefs.sms_enabled:
        cascade_order.append(NotificationChannel.SMS)
    if not prefs or prefs.email_enabled:
        cascade_order.append(NotificationChannel.EMAIL)
    if prefs and prefs.telegram_enabled:
        cascade_order.append(NotificationChannel.TELEGRAM)

    # Каскадная отправка
    for channel_type in cascade_order:
        # Проверка дедупликации
        if not await check_deduplication(user.id, survey_id, channel_type.value):
            print(f"🔄 Дедупликация: уведомление уже отправлено по {channel_type.value}")
            continue

        channel = CHANNELS[channel_type]

        try:
            success = await channel.send(user, title, body, data)

            # Записываем уведомление в БД
            notification = Notification(
                user_id=user.id,
                survey_id=survey_id,
                channel=channel_type,
                status=NotificationStatus.SENT if success else NotificationStatus.FAILED,
                cost=channel.get_cost() if success else 0.0,
                sent_at=datetime.now(timezone.utc) if success else None,
            )
            db.add(notification)
            await db.flush()

            if success:
                await increment_rate_limit(user.id)
                print(f"✅ Уведомление отправлено {user.phone} через {channel_type.value}")
                return notification
            else:
                print(f"❌ Не удалось отправить через {channel_type.value}, пробуем следующий канал")

        except Exception as e:
            print(f"❌ Ошибка при отправке через {channel_type.value}: {e}")
            # Записываем неудачную попытку
            notification = Notification(
                user_id=user.id,
                survey_id=survey_id,
                channel=channel_type,
                status=NotificationStatus.FAILED,
                cost=0.0,
            )
            db.add(notification)
            await db.flush()

    print(f"⚠️ Все каналы исчерпаны для {user.phone}")
    return None


async def get_notification_metrics(db: AsyncSession) -> dict:
    """Получение метрик уведомлений для дашборда."""
    # Общие метрики
    total_sent = await db.scalar(
        select(func.count(Notification.id)).where(
            Notification.status.in_([
                NotificationStatus.SENT,
                NotificationStatus.DELIVERED,
                NotificationStatus.OPENED,
                NotificationStatus.CLICKED,
            ])
        )
    ) or 0

    total_delivered = await db.scalar(
        select(func.count(Notification.id)).where(
            Notification.status.in_([
                NotificationStatus.DELIVERED,
                NotificationStatus.OPENED,
                NotificationStatus.CLICKED,
            ])
        )
    ) or 0

    total_opened = await db.scalar(
        select(func.count(Notification.id)).where(
            Notification.status.in_([
                NotificationStatus.OPENED,
                NotificationStatus.CLICKED,
            ])
        )
    ) or 0

    total_clicked = await db.scalar(
        select(func.count(Notification.id)).where(
            Notification.status == NotificationStatus.CLICKED
        )
    ) or 0

    total_cost = await db.scalar(
        select(func.coalesce(func.sum(Notification.cost), 0.0))
    ) or 0.0

    # Метрики по каналам
    by_channel = {}
    for channel in NotificationChannel:
        channel_count = await db.scalar(
            select(func.count(Notification.id)).where(
                Notification.channel == channel
            )
        ) or 0
        channel_sent = await db.scalar(
            select(func.count(Notification.id)).where(
                Notification.channel == channel,
                Notification.status.in_([
                    NotificationStatus.SENT,
                    NotificationStatus.DELIVERED,
                    NotificationStatus.OPENED,
                    NotificationStatus.CLICKED,
                ])
            )
        ) or 0
        by_channel[channel.value] = {
            "total": channel_count,
            "sent": channel_sent,
        }

    return {
        "total_sent": total_sent,
        "total_delivered": total_delivered,
        "total_opened": total_opened,
        "total_clicked": total_clicked,
        "delivery_rate": (total_delivered / total_sent * 100) if total_sent > 0 else 0.0,
        "open_rate": (total_opened / total_sent * 100) if total_sent > 0 else 0.0,
        "click_rate": (total_clicked / total_sent * 100) if total_sent > 0 else 0.0,
        "by_channel": by_channel,
        "total_cost": float(total_cost),
    }
