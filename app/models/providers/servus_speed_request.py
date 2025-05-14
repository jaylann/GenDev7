from pydantic import BaseModel

from app.models.providers.servus_speed_address import ServusSpeedAddress


class ServusSpeedRequest(BaseModel):
    address: ServusSpeedAddress
