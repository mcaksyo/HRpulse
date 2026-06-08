"""
Celery задачи для уведомлений.
Отправка уведомлений при публикации, напоминания, пульс-опросы.
"""

import asyncio
from datetime import datetime, timedelta, timezone

from database import async_session
from models.question import Question, QuestionType
from models.response import SurveyResponse
from models.survey import AnonymityMode, Survey, SurveyStatus
from models.user import User, UserRole
from services.notification_service import send_cascade_notification
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from tasks import celery_app


_celery_loop = None


def run_async(coro):
    """Run async code from sync Celery tasks using one persistent loop per worker."""
    global _celery_loop

    if _celery_loop is None or _celery_loop.is_closed():
        _celery_loop = asyncio.new_event_loop()

    asyncio.set_event_loop(_celery_loop)
    return _celery_loop.run_until_complete(coro)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_survey_notifications(self, survey_id: int):
    """
    Отправка уведомлений при публикации опроса.
    Рассылка всем целевым пользователям через каскадные каналы.
    """
    async def _send():
        async with async_session() as db:
            try:
                # Получаем опрос
                result = await db.execute(
                    select(Survey).where(Survey.id == survey_id)
                )
                survey = result.scalar_one_or_none()
                if not survey:
                    print(f"❌ Опрос {survey_id} не найден")
                    return

                # Получаем целевых пользователей
                user_query = select(User).options(
                    selectinload(User.push_subscriptions),
                    selectinload(User.notification_preference),
                ).where(
                    User.is_active == True,  # noqa: E712
                    User.id != survey.created_by,
                )

                if survey.target_departments:
                    user_query = user_query.where(
                        User.department.in_(survey.target_departments)
                    )
                if survey.target_roles:
                    user_query = user_query.where(
                        User.role.in_(survey.target_roles)
                    )

                users_result = await db.execute(user_query)
                users = list(users_result.scalars().all())

                sent_count = 0
                for user in users:
                    notification = await send_cascade_notification(
                        db=db,
                        user=user,
                        survey_id=survey.id,
                        title=f"Новый опрос: {survey.title}",
                        body=survey.description or "Пройдите опрос",
                        data={"survey_id": survey.id, "type": "new_survey"},
                    )
                    if notification:
                        sent_count += 1

                await db.commit()
                print(f"✅ Отправлено {sent_count} уведомлений для опроса {survey_id}")

            except Exception as e:
                await db.rollback()
                print(f"❌ Ошибка при отправке уведомлений: {e}")
                raise

    try:
        run_async(_send())
    except Exception as exc:
        self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_reminder(self, survey_id: int, hours_before: int = 24):
    """
    Отправка напоминания о приближающемся дедлайне опроса.
    Отправляется за 48ч и 24ч до дедлайна.
    """
    async def _send():
        async with async_session() as db:
            try:
                result = await db.execute(
                    select(Survey).where(
                        Survey.id == survey_id,
                        Survey.status.in_([SurveyStatus.PUBLISHED, SurveyStatus.ACTIVE]),
                    )
                )
                survey = result.scalar_one_or_none()
                if not survey or not survey.ends_at:
                    return

                # Пользователи, которые ещё не ответили
                responded_ids_result = await db.execute(
                    select(SurveyResponse.user_id).where(
                        SurveyResponse.survey_id == survey_id,
                        SurveyResponse.completed_at.isnot(None),
                    )
                )
                responded_ids = {row[0] for row in responded_ids_result if row[0]}

                user_query = select(User).options(
                    selectinload(User.push_subscriptions),
                    selectinload(User.notification_preference),
                ).where(
                    User.is_active == True,  # noqa: E712
                    User.id != survey.created_by,
                    User.id.notin_(responded_ids) if responded_ids else True,
                )

                if survey.target_departments:
                    user_query = user_query.where(
                        User.department.in_(survey.target_departments)
                    )
                if survey.target_roles:
                    user_query = user_query.where(
                        User.role.in_(survey.target_roles)
                    )

                users_result = await db.execute(user_query)
                users = list(users_result.scalars().all())

                hours_text = f"{hours_before} ч." if hours_before < 48 else f"{hours_before // 24} дн."
                sent_count = 0
                for user in users:
                    if user.id not in responded_ids:
                        notification = await send_cascade_notification(
                            db=db,
                            user=user,
                            survey_id=survey.id,
                            title=f"Напоминание: {survey.title}",
                            body=f"До окончания опроса осталось {hours_text}. Не забудьте пройти!",
                            data={"survey_id": survey.id, "type": "reminder"},
                        )
                        if notification:
                            sent_count += 1

                await db.commit()
                print(f"📢 Отправлено {sent_count} напоминаний для опроса {survey_id}")

            except Exception as e:
                await db.rollback()
                print(f"❌ Ошибка при отправке напоминаний: {e}")
                raise

    try:
        run_async(_send())
    except Exception as exc:
        self.retry(exc=exc)


@celery_app.task
def scheduled_pulse_survey():
    """
    Автоматическое создание и публикация пульс-опроса.
    Запускается по расписанию (например, каждый понедельник).
    """
    async def _create():
        async with async_session() as db:
            try:
                # Находим первого HR для автора
                result = await db.execute(
                    select(User).where(User.role == UserRole.HR).limit(1)
                )
                hr_user = result.scalar_one_or_none()
                if not hr_user:
                    print("❌ Нет HR-пользователя для создания пульс-опроса")
                    return

                now = datetime.now(timezone.utc)
                survey = Survey(
                    created_by=hr_user.id,
                    title=f"Пульс-опрос {now.strftime('%d.%m.%Y')}",
                    description="Еженедельный экспресс-опрос о настроении и условиях работы.",
                    status=SurveyStatus.PUBLISHED,
                    anonymity=AnonymityMode.FULL,
                    starts_at=now,
                    ends_at=now + timedelta(days=3),
                    estimated_minutes=2,
                )
                db.add(survey)
                await db.flush()

                # Стандартные вопросы пульс-опроса
                questions = [
                    Question(
                        survey_id=survey.id,
                        order_num=0,
                        text="Как вы оцениваете свою рабочую неделю?",
                        type=QuestionType.SCALE,
                        scale_min=0,
                        scale_max=10,
                        scale_min_label="Ужасно",
                        scale_max_label="Отлично",
                    ),
                    Question(
                        survey_id=survey.id,
                        order_num=1,
                        text="Что можно улучшить?",
                        type=QuestionType.TEXT,
                        required=False,
                    ),
                ]
                for q in questions:
                    db.add(q)

                await db.commit()
                print(f"✅ Создан пульс-опрос: {survey.title} (ID: {survey.id})")

            except Exception as e:
                await db.rollback()
                print(f"❌ Ошибка при создании пульс-опроса: {e}")

    run_async(_create())


# Периодические задачи Celery Beat
celery_app.conf.beat_schedule = {
    "weekly-pulse-survey": {
        "task": "tasks.notification_tasks.scheduled_pulse_survey",
        "schedule": 604800.0,  # Каждые 7 дней (в секундах)
    },
}
