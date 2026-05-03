import asyncio
import json
import time
import re
from telethon import TelegramClient, events
from geopy.geocoders import Nominatim

# --- РЕКОМЕНДАЦІЯ: Замініть ці дані на ваші власні ---
# Ви можете отримати API_ID та API_HASH за посиланням: https://my.telegram.org
API_ID = 25635427  
API_HASH = 'e2f99fb35400e6628c88ffd388308598' 
CHANNEL_USERNAME = 'monitor1654' # Назва каналу (наприклад, 'monitor1654' або @channel_link)

# Ініціалізація Nominatim (Geopy)
geolocator = Nominatim(user_agent="threat_parser")
cache = {}

def get_location(city_name):
    """Отримує координати населеного пункту з кешу або через OSM API."""
    if city_name in cache:
        return cache[city_name]
    
    # Nominatim API ліміт: 1 запит за 1 сек
    time.sleep(1.1)
    
    try:
        # Пошук локації з уточненням області
        location = geolocator.geocode(f"{city_name}, Харківська область, Україна")
        if location:
            cache[city_name] = (location.latitude, location.longitude)
            return (location.latitude, location.longitude)
    except Exception as e:
        print(f"Error geocoding {city_name}: {e}")
    return None

def extract_city(text):
    """
    Примітивний парсинг для вилучення назви населеного пункту.
    Шукає слово після 'на', 'в', 'у'.
    """
    # Наприклад: 'БПЛА на Печеніги' -> 'Печеніги'
    match = re.search(r'(?:на|в|у)\s+([А-Яа-яЄєІіЇїҐґ\s]+)', text)
    if match:
        return match.group(1).strip()
    return None

def save_threat(threat):
    """Зберігає дані про загрозу в data.json."""
    filename = 'data.json'
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        data = []
    
    data.append(threat)
    
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)
    print(f"Saved: {threat}")

async def main():
    """Основна функція для роботи з Telethon."""
    client = TelegramClient('parser_session', API_ID, API_HASH)
    await client.start()
    print("Telegram parser started...")

    # Обробник нових повідомлень у вказаному каналі
    @client.on(events.NewMessage(chats=CHANNEL_USERNAME))
    async def handler(event):
        text = event.raw_message.message
        city = extract_city(text)
        
        if city:
            coords = get_location(city)
            if coords:
                threat = {
                    "id": int(time.time()),
                    "lat": coords[0],
                    "lng": coords[1],
                    "type": "Шахед" if "шахед" in text.lower() else "Молнія" if "молнія" in text.lower() else "Авіація",
                    "target": city,
                    "time": time.strftime("%H:%M"),
                    "severity": "high"
                }
                save_threat(threat)

    await client.run_until_disconnected()

if __name__ == '__main__':
    # Запуск асинхронного циклу
    asyncio.run(main())
