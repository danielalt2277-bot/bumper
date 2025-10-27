import asyncio
import json
import logging
import random
import time
from asyncio import sleep
from dataclasses import dataclass, field
from typing import List, Optional

import aiohttp
from aiohttp import ClientSession

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

@dataclass
class User:
    id: str
    username: str

@dataclass
class Config:
    token: str
    message: str
    guild_id: str
    timeout_settings: dict = field(default_factory=lambda: {"min": 3, "max": 9})

class DiscordAPI:
    def __init__(self, token: str):
        self.token = token
        self.headers = {"Authorization": token}

    async def get_guild_members(self, guild_id: str) -> List[User]:
        all_members = []
        last_user_id = None
        url = f"https://discord.com/api/v9/guilds/{guild_id}/members?limit=1000"

        async with aiohttp.ClientSession(headers=self.headers) as session:
            while True:
                paginated_url = f"{url}&after={last_user_id}" if last_user_id else url
                try:
                    async with session.get(paginated_url) as response:
                        if response.status == 200:
                            members_data = await response.json()
                            if not members_data:
                                break  # No more members

                            all_members.extend([User(id=member['user']['id'], username=member['user']['username']) for member in members_data])
                            last_user_id = members_data[-1]['user']['id']

                            if len(members_data) < 1000:
                                break # Last page
                        else:
                            logging.error(f"Failed to get guild members. Status: {response.status}, Response: {await response.text()}")
                            break
                except aiohttp.ClientError as e:
                    logging.error(f"An error occurred while getting guild members: {e}")
                    break
        return all_members

    async def send_dm(self, user_id: str, message: str) -> bool:
        url = "https://discord.com/api/v9/users/@me/channels"
        payload = {"recipient_id": user_id}
        async with aiohttp.ClientSession(headers=self.headers) as session:
            try:
                # Open a DM channel
                async with session.post(url, json=payload) as response:
                    if response.status == 200:
                        channel = await response.json()
                        channel_id = channel['id']
                    else:
                        logging.error(f"Failed to create DM channel with {user_id}. Status: {response.status}, Response: {await response.text()}")
                        return False

                # Send the message
                message_url = f"https://discord.com/api/v9/channels/{channel_id}/messages"
                message_payload = {"content": message}
                async with session.post(message_url, json=message_payload) as response:
                    if response.status == 200:
                        logging.info(f"Successfully sent message to user {user_id}")
                        return True
                    else:
                        logging.error(f"Failed to send message to {user_id}. Status: {response.status}, Response: {await response.text()}")
                        return False
            except aiohttp.ClientError as e:
                logging.error(f"An error occurred while sending DM to {user_id}: {e}")
                return False

async def mass_dm_normal(api: DiscordAPI, users: List[User], message: str):
    logging.info("Starting Mass DM in Normal Mode...")
    for user in users:
        await api.send_dm(user.id, message)
        await asyncio.sleep(random.uniform(1, 3))  # Small delay to be safe

async def mass_dm_timeout(api: DiscordAPI, users: List[User], message: str, min_delay: int, max_delay: int):
    logging.info("Starting Mass DM in Timeout Mode...")
    for user in users:
        await api.send_dm(user.id, message)
        delay = random.uniform(min_delay, max_delay)
        logging.info(f"Waiting for {delay:.2f} seconds before next message...")
        await asyncio.sleep(delay)

def get_user_choice():
    print("\nMass DM Options:")
    print(" [1] Normal Mode")
    print(" [2] Timeout Mode (Avoids Flagging)")
    while True:
        choice = input("Choose Option: ")
        if choice in ["1", "2"]:
            return choice
        else:
            print("Invalid option. Please choose 1 or 2.")

def load_config() -> Optional[Config]:
    try:
        with open("config.json", "r", encoding="utf-8") as f:
            config_data = json.load(f)
            return Config(
                token=config_data.get("token"),
                message=config_data.get("message"),
                guild_id=config_data.get("guild_id"),
                timeout_settings=config_data.get("timeout_settings", {"min": 3, "max": 9})
            )
    except FileNotFoundError:
        logging.error("config.json not found. Please create one.")
        return None
    except json.JSONDecodeError:
        logging.error("Invalid JSON in config.json. Please check the file.")
        return None

async def main():
    config = load_config()
    if not config:
        return

    api = DiscordAPI(config.token)

    users = await api.get_guild_members(config.guild_id)
    if not users:
        logging.warning("No users found or failed to fetch users.")
        return

    logging.info(f"Found {len(users)} users in the guild.")

    choice = get_user_choice()

    if choice == "1":
        await mass_dm_normal(api, users, config.message)
    elif choice == "2":
        min_delay = config.timeout_settings.get("min", 3)
        max_delay = config.timeout_settings.get("max", 9)
        await mass_dm_timeout(api, users, config.message, min_delay, max_delay)

    logging.info("Mass DM process finished.")

if __name__ == "__main__":
    asyncio.run(main())