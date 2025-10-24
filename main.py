import requests
import time
import threading
import random
import json
import logging

# --- Basic Configuration ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')

# --- Constants ---
BASE_URL = 'https://discord.com/api/v9'
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
]

class DiscordClient:
    def __init__(self, token, proxy=None):
        self.token = token
        self.proxy = proxy
        self.session = self._create_session()
        self.user = self._get_user_info()
        if not self.user:
            raise ValueError("Invalid token or failed to fetch user info.")
        self.last_send_time = 0
        self.send_lock = threading.Lock()

    def _create_session(self):
        session = requests.Session()
        session.headers = {
            'authorization': self.token,
            'content-type': 'application/json',
            'user-agent': random.choice(USER_AGENTS)
        }
        if self.proxy:
            session.proxies = {"http": self.proxy, "https": self.proxy}
        return session

    def _get_user_info(self):
        try:
            r = self.session.get(f"{BASE_URL}/users/@me")
            if r.status_code == 200:
                user_data = r.json()
                logging.info(f"Logged in as {user_data['username']}#{user_data['discriminator']}")
                return user_data
            else:
                logging.error(f"Failed to get user info for token ending in ...{self.token[-4:]}: {r.status_code} -> {r.text}")
                return None
        except requests.exceptions.RequestException as e:
            logging.error(f"Network error while getting user info for token ...{self.token[-4:]}: {e}")
            return None

    def send_typing_indicator(self, channel_id):
        try:
            self.session.post(f"{BASE_URL}/channels/{channel_id}/typing")
        except requests.exceptions.RequestException as e:
            logging.warning(f"Could not send typing indicator in {channel_id}: {e}")

    def send_message(self, channel_id, content):
        with self.send_lock:
            now = time.time()
            if now - self.last_send_time < config['send_cooldown']:
                time.sleep(config['send_cooldown'] - (now - self.last_send_time))

            backoff = 1
            while True:
                self.send_typing_indicator(channel_id)
                time.sleep(random.uniform(1, 3)) # Human-like typing delay

                r = self.session.post(f"{BASE_URL}/channels/{channel_id}/messages", json={"content": content})
                self.last_send_time = time.time()

                if r.status_code == 200:
                    logging.info(f"Sent to {channel_id} by {self.user['username']}")
                    return True
                elif r.status_code == 429: # Rate limited
                    retry_after = r.json().get('retry_after', 1)
                    logging.warning(f"Rate limited in {channel_id}. Retrying after {retry_after}s.")
                    time.sleep(retry_after)
                else:
                    logging.error(f"Failed to send to {channel_id}: {r.status_code} -> {r.text}")
                    return False

def load_config():
    with open('config.json', 'r') as f:
        return json.load(f)

def fetch_proxies_from_api(url="https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=protocolipport&format=text"):
    """Fetches a list of proxies from the specified API."""
    try:
        logging.info("Fetching proxies from API...")
        r = requests.get(url)
        if r.status_code == 200:
            proxies = [line.strip() for line in r.text.split('\n') if line.strip()]
            logging.info(f"Successfully fetched {len(proxies)} proxies.")
            return proxies
        else:
            logging.error(f"Failed to fetch proxies. Status code: {r.status_code}")
            return []
    except requests.exceptions.RequestException as e:
        logging.error(f"Error fetching proxies: {e}")
        return []

def channel_worker(client, channel_id, interval, messages):
    msg_toggle = False
    while True:
        content = messages[0] if msg_toggle else messages[1]
        client.send_message(channel_id, content)
        msg_toggle = not msg_toggle

        # Add jitter to the interval
        jitter = interval * 0.1
        sleep_time = interval + random.uniform(-jitter, jitter)
        time.sleep(sleep_time)

if __name__ == "__main__":
    config = load_config()
    clients = []

    use_proxies = config.get("use_proxies", False)
    proxies = []
    if use_proxies:
        proxies = fetch_proxies_from_api()
        random.shuffle(proxies)

    proxy_iter = iter(proxies)

    for token in config['tokens']:
        client_initialized = False
        if use_proxies:
            while not client_initialized:
                try:
                    proxy = next(proxy_iter)
                    logging.info(f"Attempting to initialize token ...{token[-4:]} with proxy {proxy}")
                    client = DiscordClient(token, proxy)
                    clients.append(client)
                    client_initialized = True
                except StopIteration:
                    logging.error("Ran out of proxies. Some tokens may not be initialized.")
                    break
                except ValueError as e:
                    logging.warning(f"Proxy {proxy} failed for token ...{token[-4:]}. Error: {e}. Trying next proxy.")
        else:
            try:
                logging.info(f"Attempting to initialize token ...{token[-4:]} without proxy.")
                client = DiscordClient(token)
                clients.append(client)
                client_initialized = True
            except ValueError as e:
                logging.error(e)

        if not client_initialized:
            logging.error(f"Could not initialize a client for token ...{token[-4:]}")


    if not clients:
        logging.error("No valid clients could be initialized. Exiting.")
        exit()

    logging.info(f"Successfully initialized {len(clients)} clients.")

    channel_ids = list(config['channel_intervals'].keys())
    num_clients = len(clients)

    for idx, client in enumerate(clients):
        my_channels = [cid for i, cid in enumerate(channel_ids) if i % num_clients == idx]

        delay_offset = 0
        for channel_id in my_channels:
            threading.Thread(
                target=channel_worker,
                args=(client, channel_id, config['channel_intervals'][channel_id], config['messages']),
                daemon=True
            ).start()
            delay_offset += 5

    while True:
        time.sleep(1)
