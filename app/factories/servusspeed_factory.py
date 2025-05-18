from __future__ import annotations

from typing import Dict, Any, Optional

from app.models import Address
from app.models.base.offer import VoucherKind
from ..models.providers.servus_speed_address import ServusSpeedAddress
from ..models.providers.servus_speed_request import ServusSpeedRequest
from ..models.providers.servusspeed_response import ServusSpeedResponse
from ..utils.logger import logger


class ServusSpeedFactory:
    """
    Factory for building Servus Speed request payloads and parsing
    individual product-detail responses into ServusSpeedResponse models.
    """

    @staticmethod
    def build_available_products_body(address: Address) -> Dict[str, Any]:
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
    def parse_detail_response(pid: str, payload: Any) -> Optional[ServusSpeedResponse]:
        """
        Safely parse one product-detail payload into a ServusSpeedResponse.
        Returns None on any malformed or missing data.
        """
        try:
            if not isinstance(payload, dict):
                # Escape braces in payload for logging, as payload itself might contain them
                logger.error(
                    f"Invalid payload type for pid {pid}: expected dict, got {type(payload).__name__}"
                )
                return None

            prod = payload.get("servusSpeedProduct")
            if not isinstance(prod, dict):
                logger.error(
                    f"Invalid payload for pid {pid}: missing or invalid 'servusSpeedProduct'"
                )
                return None

            info = prod.get("productInfo")
            if not isinstance(info, dict):
                logger.error(
                    f"Invalid payload for pid {pid}: missing or invalid 'productInfo'"
                )
                return None

            price = prod.get("pricingDetails")
            if not isinstance(price, dict):
                logger.error(
                    f"Invalid payload for pid {pid}: missing or invalid 'pricingDetails'"
                )
                return None

            def to_int(value, name):
                try:
                    return int(value)
                except (TypeError, ValueError) as e:
                    # Escape braces in value for logging
                    logger.warning(
                        f"Invalid integer '{value}' for field '{name}' in pid {pid}"
                    )
                    raise ValueError(f"Invalid integer for field '{name}'") from e

            provider_name = prod.get("providerName")
            if not isinstance(provider_name, str):
                logger.error(f"Invalid providerName '{provider_name}' for pid {pid}")
                return None

            speed = int(round(float(info.get("speed"))))
            contract_duration = to_int(
                info.get("contractDurationInMonths"), "contractDurationInMonths"
            )
            monthly_cost = to_int(price.get("monthlyCostInCent"), "monthlyCostInCent")

            connection_type = info.get("connectionType")
            if not isinstance(connection_type, str):
                connection_type_str = (
                    str(connection_type).replace("{", "{{").replace("}", "}}")
                )
                logger.error(
                    f"Invalid connectionType '{connection_type_str}' for pid {pid}"
                )
                return None

            tv_value = info.get("tv")
            # Corrected tv_package_name logic: strip whitespace and ensure non-empty for package name
            tv_package_name_candidate = tv_value if isinstance(tv_value, str) else None
            if tv_package_name_candidate:
                tv_package_name_candidate = tv_package_name_candidate.strip()
            tv_package_name = (
                tv_package_name_candidate if tv_package_name_candidate else None
            )
            tv_included = bool(tv_package_name)

            data_cap = None
            if "limitFrom" in info:
                try:
                    data_cap = to_int(info.get("limitFrom"), "limitFrom")
                except ValueError:
                    data_cap = None

            max_age = None
            if "maxAge" in info:
                try:
                    max_age = to_int(info.get("maxAge"), "maxAge")
                except ValueError:
                    max_age = None

            installation_val = price.get("installationService", False)
            if isinstance(installation_val, bool):
                installation_service_included = installation_val
            else:
                installation_service_included = str(
                    installation_val
                ).strip().lower() in ("yes", "true", "included")

            discount_val = prod.get("discount", 0)
            try:
                discount = to_int(discount_val, "discount")
            except ValueError:
                discount = 0

            response = ServusSpeedResponse(
                provider_name=provider_name,
                product_id=pid,
                speed_down_mbit=speed,
                data_cap_gb=data_cap,
                connection_type=connection_type,
                price_cents_month=monthly_cost,
                contract_duration_months=contract_duration,
                installation_service_included=installation_service_included,
                tv_included=tv_included,
                tv_package_name=tv_package_name,
                voucher_type=VoucherKind.ABSOLUTE if discount else None,
                voucher_value_cents=abs(discount) if discount else None,
                max_age=max_age,
            )
            return response
        except KeyError as e:
            logger.warning(f"Missing expected field {e} for pid {pid}")
            return None
        except ValueError as e:
            logger.warning(f"Invalid value for pid {pid}: {e}")
            return None
        except TypeError as e:
            logger.warning(
                f"Type error parsing Servus Speed response for pid {pid}: {e}"
            )
            return None
        except Exception as e:  # Catch any other unexpected error
            logger.warning(
                f"Unexpected error parsing Servus Speed response for pid {pid}: {e}"
            )
            return None
