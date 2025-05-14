import httpx

from app.providers.byteme import ByteMeProvider
from app.providers.pingperfect import PingPerfectProvider
from app.providers.servusspeed import ServusSpeedProvider
from app.providers.verbyndich import VerbynDichProvider
from app.providers.webwunder import WebWunderProvider
from app.utils.logger import logger
_shared_client = httpx.AsyncClient(timeout=httpx.Timeout(10.0))


async def get_providers():
    providers =  [
        WebWunderProvider(_shared_client),
        ByteMeProvider(_shared_client),
        PingPerfectProvider(_shared_client),
        ServusSpeedProvider(_shared_client),
        VerbynDichProvider(_shared_client),
    ]
    logger.info(f"Loaded providers: {[p.name for p in providers]}")
    return providers
