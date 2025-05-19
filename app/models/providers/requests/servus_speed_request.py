from pydantic import BaseModel

from app.models.providers import ServusSpeedAddress


class ServusSpeedRequest(BaseModel):
    address: ServusSpeedAddress
