"""
Celery задачи PulseHR.
"""

from celery import Celery
from config import settings

celery_app = Celery(
    "pulsehr",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["tasks.notification_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Europe/Moscow",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)

# Автообнаружение задач
celery_app.autodiscover_tasks(["tasks"])

# Явная регистрация задач для docker/celery worker startup.
import tasks.notification_tasks  # noqa: E402,F401
