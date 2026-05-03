import os
import re
import json
import asyncio
from datetime import datetime
from telethon import TelegramClient
from telethon.sessions import StringSession

# Telegram API credentials
API_ID = os.environ.get('TG_API_ID')
API_HASH = os.environ.get('TG_API_HASH')
SESSION_STRING = os.environ.get('TG_SESSION_STRING')
CHANNEL_USERNAME = 'monitor1654'
OUTPUT_FILE = 'public/data.json'

# NLP Patterns
THREAT_TYPES = {
    'drone': r'(БПЛА|ударний|Молнія|Гербера|Шахед)',
    'missile': r'(Швидкісна ціль|ракета)',
    'kab': r'(КАБ)',
}

def map_type(text):
    text = text.lower()
    for t_type, pattern in THREAT_TYPES.items():
        if re.search(pattern, text):
            return t_type
    return 'unknown'

def parse_message(text):
    text_lower = text.lower()
    
    # Status Logic: Removal
    if any(phrase in text_lower for phrase in ["чисто", "не фіксується", "впав", "відбій", "збито"]):
        return 'clear', None

    # Quantity/Location extraction
    threats = []
    
    # Regex: extract quantity and location
    matches = re.findall(r'(\d+)\s+(?:на|курсом на)\s+([а-яёіїєґ]+)', text_lower)
    
    if not matches:
        target_match = re.search(r'(?:на|курсом на)\s+([а-яёіїєґ]+)', text_lower)
        if target_match:
            matches = [('1', target_match.group(1))]

    if matches:
        t_type = map_type(text_lower)
        for qty, loc in matches:
            threats.append({
                'id': f"{loc}_{t_type}_{datetime.now().strftime('%M')}",
                'type': t_type,
                'location_name': loc.capitalize(),
                'quantity': int(qty),
                'source': 'monitor1654',
                'timestamp': datetime.now().isoformat()
            })
            
    return 'update', threats

async def main():
    if not API_ID or not API_HASH or not SESSION_STRING:
        print("Set required TG ENV variables")
        return

    client = TelegramClient(StringSession(SESSION_STRING), int(API_ID), API_HASH)
    await client.start()
    
    messages = await client.get_messages(CHANNEL_USERNAME, limit=10)
    
    current_threats = {}
    
    for msg in messages:
        if not msg.text: continue
        
        action, new_threats = parse_message(msg.text)
        
        if action == 'clear':
            current_threats = {}
            break 
        elif action == 'update' and new_threats:
            for nt in new_threats:
                current_threats[nt['location_name']] = nt

    data = list(current_threats.values())
            
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    await client.disconnect()

if __name__ == '__main__':
    asyncio.run(main())
