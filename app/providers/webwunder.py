from __future__ import annotations

import os
from typing import List

import zeep
from zeep.transports import AsyncTransport

from .base import ProviderBase, ProviderError
from ..models import Offer, Address

WEBWUNDER_WSDL = os.getenv(
    "WEBWUNDER_WSDL",
    "https://webwunder.gendev7.check24.fun/endpunkte/soap/ws/getInternetOffers.wsdl",
)
WEBWUNDER_API_KEY = os.getenv("WEBWUNDER_API_KEY")


class WebWunderProvider(ProviderBase):
    name = "WebWunder"

    async def fetch(self, address: Address) -> List[Offer]:
        # Zeep async transport must be given an httpx.AsyncClient instance.
        transport = AsyncTransport(client=self.client)

        # `settings` avoids strict type enforcement to cope with legacy WSDL quirks.
        settings = zeep.Settings(strict=False)

        try:
            client = zeep.AsyncClient(wsdl=WEBWUNDER_WSDL, transport=transport,
                                      settings=settings)  # type: ignore[arg-type]

            # Build SOAP body matching the README sample.
            input_obj = {
                "installation": True,
                "connectionEnum": "DSL",
                "address": {
                    "street": address.street,
                    "houseNumber": address.house_number,
                    "city": address.city,
                    "plz": address.plz,
                    "countryCode": address.country_code,
                },
            }

            # Pass API key via HTTP header.
            result = await client.service.legacyGetInternetOffers(
                _soapheaders={"X-Api-Key": WEBWUNDER_API_KEY},
                input=input_obj,
            )

        except Exception as exc:  # broad catch to wrap any Zeep/HTTP error
            raise ProviderError(f"WebWunder failed: {exc}") from exc

        # Parse the XML-to-Python dict into Offer model(s)
        offers: List[Offer] = []
        for item in result.get("offers", []):
            try:
                offers.append(
                    Offer(
                        provider=self.name,
                        product_id=item["productId"],
                        speed_mbit=item["speed"],
                        price_cents_month=item["monthlyCostInCent"],
                        price_cents_month_after24=item["afterTwoYearsMonthlyCost"],
                        duration_months=item["durationInMonths"],
                        connection_type=item["connectionType"],
                        installation_service=item["installationService"],
                        tv=item["tv"],
                        data_limit_gb=item.get("limitFrom"),
                        voucher=item.get("voucherValue"),
                    )
                )
            except Exception as exc:
                # Bad data from provider – continue but log.
                continue

        return offers
