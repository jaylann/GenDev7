# app/providers/servusspeed_factory.py
from __future__ import annotations

from typing import Dict, Any

from app.models import Address
from app.models.base.offer import VoucherKind
from ..models.providers.servus_speed_address import ServusSpeedAddress
from ..models.providers.servus_speed_request import ServusSpeedRequest
from ..models.providers.servusspeed_response import ServusSpeedResponse


class ServusSpeedFactory:
    """
    Factory for building Servus Speed request payloads and parsing
    individual product-detail responses into ServusSpeedResponse models.
    """

    @staticmethod
    def build_available_products_body(address: Address) -> Dict[str, Any]:
        """
        Build the JSON body for the 'available-products' endpoint.
        """
        s_addr: ServusSpeedAddress = ServusSpeedAddress(
            strasse=address.street,
            hausnummer=address.house_number,
            postleitzahl=address.plz,
            stadt=address.city,
            land=address.country_code,
        )
        body: Dict[str, Any] = ServusSpeedRequest(address=s_addr).model_dump()
        return body

    @staticmethod
    def parse_detail_response(pid: str, payload: Dict[str, Any]) -> ServusSpeedResponse:
        """
        Inline the logic formerly in ServusSpeedResponse.from_json:
        parse one product-detail payload into a ServusSpeedResponse.
        """
        prod: Dict[str, Any] = payload["servusSpeedProduct"]
        info: Dict[str, Any] = prod["productInfo"]
        price: Dict[str, Any] = prod["pricingDetails"]
        discount: int = int(prod.get("discount") or 0)

        response: ServusSpeedResponse = ServusSpeedResponse(
            provider_name=prod["providerName"],
            product_id=pid,
            speed_down_mbit=int(info["speed"]),
            data_cap_gb=info.get("limitFrom"),
            connection_type=info["connectionType"],
            price_cents_month=int(price["monthlyCostInCent"]),
            contract_duration_months=int(info["contractDurationInMonths"]),
            installation_service_included=bool(price.get("installationService", False)),
            tv_included=bool(info.get("tv")),
            tv_package_name=info.get("tv"),
            voucher_type=VoucherKind.ABSOLUTE if discount else None,
            voucher_value_cents=discount or None,
            max_age=info.get("maxAge"),
        )
        return response
