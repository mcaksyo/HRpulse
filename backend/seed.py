"""
Скрипт заполнения тестовыми данными.
Создаёт HR-пользователя, сотрудников и пример опроса.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.notification_preference import NotificationPreference, PreferredTime
from models.question import Question, QuestionType
from models.survey import AnonymityMode, Survey, SurveyStatus
from models.user import User, UserRole


async def seed_database(db: AsyncSession) -> dict:
    """
    Заполнение базы данных тестовыми данными.
    Возвращает словарь с созданными объектами.
    """
    print("\n🌱 Начинаем заполнение тестовыми данными...\n")

    # === Пользователи ===

    # Проверяем, не существует ли уже HR-пользователь
    existing = await db.execute(
        select(User).where(User.phone == "+79001234567")
    )
    if existing.scalar_one_or_none():
        print("⚠️ Тестовые данные уже существуют. Пропускаем.")
        return {"message": "Тестовые данные уже существуют"}

    hr_user = User(
        phone="+79001234567",
        name="Анна Петрова",
        department="HR",
        position="HR-директор",
        city="Москва",
        timezone="Europe/Moscow",
        role=UserRole.HR,
    )
    db.add(hr_user)

    employee1 = User(
        phone="+79001234568",
        name="Иван Сидоров",
        department="Разработка",
        position="Senior Backend Developer",
        city="Москва",
        timezone="Europe/Moscow",
        role=UserRole.EMPLOYEE,
    )
    db.add(employee1)

    employee2 = User(
        phone="+79001234569",
        name="Мария Козлова",
        department="Маркетинг",
        position="Менеджер по маркетингу",
        city="Санкт-Петербург",
        timezone="Europe/Moscow",
        role=UserRole.EMPLOYEE,
    )
    db.add(employee2)

    employee3 = User(
        phone="+79001234570",
        name="Дмитрий Волков",
        department="Продажи",
        position="Менеджер по продажам",
        city="Екатеринбург",
        timezone="Asia/Yekaterinburg",
        role=UserRole.EMPLOYEE,
    )
    db.add(employee3)

    await db.flush()

    print(f"👤 HR: {hr_user.name} ({hr_user.phone}) — ID: {hr_user.id}")
    print(f"👤 Сотрудник: {employee1.name} ({employee1.phone}) — ID: {employee1.id}")
    print(f"👤 Сотрудник: {employee2.name} ({employee2.phone}) — ID: {employee2.id}")
    print(f"👤 Сотрудник: {employee3.name} ({employee3.phone}) — ID: {employee3.id}")

    # === Предпочтения уведомлений ===

    for user in [hr_user, employee1, employee2, employee3]:
        pref = NotificationPreference(
            user_id=user.id,
            web_push_enabled=True,
            sms_enabled=True,
            email_enabled=True,
            preferred_time=PreferredTime.ANY,
        )
        db.add(pref)

    await db.flush()

    # === Опрос с различными типами вопросов ===

    now = datetime.now(timezone.utc)

    survey = Survey(
        created_by=hr_user.id,
        title="Оценка удовлетворённости сотрудников Q2 2024",
        description=(
            "Ежеквартальный опрос для оценки уровня удовлетворённости "
            "сотрудников компании. Ваши ответы помогут нам стать лучше!"
        ),
        status=SurveyStatus.PUBLISHED,
        anonymity=AnonymityMode.PARTIAL,
        target_departments=["Разработка", "Маркетинг", "Продажи"],
        starts_at=now,
        ends_at=now + timedelta(days=14),
        estimated_minutes=10,
    )
    db.add(survey)
    await db.flush()

    print(f"\n📋 Опрос: {survey.title} — ID: {survey.id}")

    # === Вопросы ===

    # 1. eNPS вопрос (шкала 0-10)
    q1 = Question(
        survey_id=survey.id,
        order_num=0,
        text="Насколько вероятно, что вы порекомендуете нашу компанию как работодателя?",
        type=QuestionType.SCALE,
        scale_min=0,
        scale_max=10,
        scale_min_label="Точно не порекомендую",
        scale_max_label="Обязательно порекомендую",
        required=True,
    )
    db.add(q1)

    # 2. Одиночный выбор
    q2 = Question(
        survey_id=survey.id,
        order_num=1,
        text="Как вы оцениваете баланс работы и личной жизни?",
        type=QuestionType.SINGLE_CHOICE,
        options=[
            "Отлично — у меня достаточно времени на себя",
            "Хорошо — в целом баланс соблюдается",
            "Удовлетворительно — бывают переработки",
            "Плохо — часто перерабатываю",
            "Очень плохо — постоянные переработки",
        ],
        required=True,
    )
    db.add(q2)

    # 3. Множественный выбор
    q3 = Question(
        survey_id=survey.id,
        order_num=2,
        text="Какие аспекты работы вам нравятся больше всего? (выберите все подходящие)",
        type=QuestionType.MULTIPLE_CHOICE,
        options=[
            "Команда и коллеги",
            "Интересные задачи",
            "Зарплата и бонусы",
            "Гибкий график",
            "Удалённая работа",
            "Карьерный рост",
            "Обучение и развитие",
            "Корпоративная культура",
        ],
        required=True,
    )
    db.add(q3)

    # 4. Рейтинг (звёзды 1-5)
    q4 = Question(
        survey_id=survey.id,
        order_num=3,
        text="Оцените качество внутренних коммуникаций в компании",
        type=QuestionType.RATING,
        scale_min=1,
        scale_max=5,
        required=True,
    )
    db.add(q4)

    # 5. Свободный текст с ветвлением
    q5 = Question(
        survey_id=survey.id,
        order_num=4,
        text="Есть ли у вас предложения по улучшению условий работы?",
        type=QuestionType.TEXT,
        required=False,
    )
    db.add(q5)

    await db.flush()

    # Добавляем правило ветвления: если в Q2 выбрали "Плохо" или "Очень плохо",
    # показывать дополнительный вопрос
    q2.branch_rules = [
        {
            "condition_question_id": q2.id,
            "condition_value": "Плохо — часто перерабатываю",
            "action": "show",
            "target_question_id": q5.id,
        },
        {
            "condition_question_id": q2.id,
            "condition_value": "Очень плохо — постоянные переработки",
            "action": "show",
            "target_question_id": q5.id,
        },
    ]

    await db.flush()

    print(f"   ❓ Вопрос 1 (шкала 0-10, eNPS): {q1.text[:60]}...")
    print(f"   ❓ Вопрос 2 (одиночный выбор): {q2.text[:60]}...")
    print(f"   ❓ Вопрос 3 (множественный выбор): {q3.text[:60]}...")
    print(f"   ❓ Вопрос 4 (рейтинг 1-5): {q4.text[:60]}...")
    print(f"   ❓ Вопрос 5 (текст, с ветвлением): {q5.text[:60]}...")

    # === Второй опрос (черновик) ===

    survey2 = Survey(
        created_by=hr_user.id,
        title="Оценка онбординга новых сотрудников",
        description="Опрос для оценки качества процесса адаптации.",
        status=SurveyStatus.DRAFT,
        anonymity=AnonymityMode.NONE,
        estimated_minutes=5,
    )
    db.add(survey2)
    await db.flush()

    q6 = Question(
        survey_id=survey2.id,
        order_num=0,
        text="Как давно вы работаете в компании?",
        type=QuestionType.SINGLE_CHOICE,
        options=["Менее 3 месяцев", "3-6 месяцев", "6-12 месяцев", "Более года"],
        required=True,
    )
    db.add(q6)

    q7 = Question(
        survey_id=survey2.id,
        order_num=1,
        text="Оцените процесс вашего онбординга",
        type=QuestionType.SCALE,
        scale_min=0,
        scale_max=10,
        scale_min_label="Ужасно",
        scale_max_label="Превосходно",
        required=True,
    )
    db.add(q7)

    await db.flush()

    print(f"\n📋 Черновик: {survey2.title} — ID: {survey2.id}")

    print("\n✅ Тестовые данные успешно загружены!\n")
    print("=" * 50)
    print("📱 Для входа как HR используйте: +79001234567")
    print("📱 Для входа как сотрудник: +79001234568, +79001234569, +79001234570")
    print("=" * 50)
    print()

    return {
        "message": "Тестовые данные загружены",
        "hr_user": {"id": hr_user.id, "phone": hr_user.phone, "name": hr_user.name},
        "employees": [
            {"id": employee1.id, "phone": employee1.phone, "name": employee1.name},
            {"id": employee2.id, "phone": employee2.phone, "name": employee2.name},
            {"id": employee3.id, "phone": employee3.phone, "name": employee3.name},
        ],
        "surveys": [
            {"id": survey.id, "title": survey.title, "status": survey.status.value},
            {"id": survey2.id, "title": survey2.title, "status": survey2.status.value},
        ],
    }
