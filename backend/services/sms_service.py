"""
Мок-сервис отправки SMS.
В MVP: логирование в консоль + запись в БД.
"""


async def send_sms(phone: str, message: str) -> bool:
    """
    Мок отправки SMS.
    В продакшене заменить на реальный SMS-шлюз (SMS.ru, SMSC и т.д.).
    """
    print(f"\n📱 [SMS МОК] Отправка SMS")
    print(f"   Номер: {phone}")
    print(f"   Сообщение: {message}")
    print(f"   Статус: ✅ Доставлено (мок)\n")

    # В MVP всегда возвращаем успех
    return True


async def check_sms_balance() -> dict:
    """Проверка баланса SMS-шлюза (мок)."""
    return {
        "balance": 9999.99,
        "currency": "RUB",
        "provider": "MockSMS",
    }


async def get_sms_status(message_id: str) -> dict:
    """Получение статуса SMS (мок)."""
    return {
        "message_id": message_id,
        "status": "delivered",
        "delivered_at": "2024-01-01T00:00:00Z",
    }
