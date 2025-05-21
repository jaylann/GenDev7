from __future__ import annotations

from typing import Dict, Optional

from app.models import Address
from app.models.base import VoucherKind
from app.models.providers import ServusSpeedAddress
from app.models.providers.requests import ServusSpeedRequest
from app.models.providers.responses import ServusSpeedResponse
from app.utils import logger


class ServusSpeedFactory:
    """
    Factory for creating request payloads and parsing responses for Servus Speed service.

    This class provides methods to build request bodies for available products
    and to parse detail payloads into ServusSpeedResponse objects.
    """

    @staticmethod
    def build_available_products_body(address: Address) -> Dict[str, object]:
        """
        Build request payload to retrieve available products.

        Args:
            address (Address): Address model with street, house_number, plz, city, country_code.

        Returns:
            Dict[str, object]: Payload dictionary for the ServusSpeedRequest.
        """
        s_addr: ServusSpeedAddress = ServusSpeedAddress(
            strasse=address.street,
            hausnummer=address.house_number,
            postleitzahl=address.plz,
            stadt=address.city,
            land=address.country_code,
        )
        body: Dict[str, object] = ServusSpeedRequest(address=s_addr).model_dump()
        return body

    @staticmethod
    def parse_detail_response(pid: str, payload: object) -> Optional[ServusSpeedResponse]:
        """
        Parse a product-detail payload into a ServusSpeedResponse.

        Safely transforms payload into a ServusSpeedResponse model, returning
        None if required fields are missing or invalid.

        Args:
            pid (str): Identifier of the product.
            payload (object): Raw response payload to parse.

        Returns:
            Optional[ServusSpeedResponse]: Parsed response model or None on failure.
        """
        try:
            if not isinstance(payload, dict):
                # Escape braces for logging
                logger.error(
                    f"Invalid payload type for pid {pid}: expected dict, got {type(payload).__name__}"
                )
                return None

            prod_raw: object = payload.get("servusSpeedProduct")
            if not isinstance(prod_raw, dict):
                logger.error(
                    f"Invalid payload for pid {pid}: missing or invalid 'servusSpeedProduct'"
                )
                return None
            prod: Dict[str, object] = prod_raw

            info_raw: object = prod.get("productInfo")
            if not isinstance(info_raw, dict):
                logger.error(
                    f"Invalid payload for pid {pid}: missing or invalid 'productInfo'"
                )
                return None
            info: Dict[str, object] = info_raw

            price_raw: object = prod.get("pricingDetails")
            if not isinstance(price_raw, dict):
                logger.error(
                    f"Invalid payload for pid {pid}: missing or invalid 'pricingDetails'"
                )
                return None
            price: Dict[str, object] = price_raw

            def to_int(value: object, name: str) -> int:
                try:
                    return int(value)
                except (TypeError, ValueError) as exc:
                    logger.warning(
                        f"Invalid integer '{value}' for field '{name}' in pid {pid}"
                    )
                    raise ValueError(f"Invalid integer for field '{name}'") from exc

            provider_name_raw: object = prod.get("providerName")
            if not isinstance(provider_name_raw, str):
                logger.error(f"Invalid providerName '{provider_name_raw}' for pid {pid}")
                return None
            provider_name: str = provider_name_raw

            speed_raw: object = info.get("speed")
            speed: int = int(round(float(speed_raw)))  # type: ignore[arg-type]

            contract_duration_raw: object = info.get("contractDurationInMonths")
            contract_duration: int = to_int(contract_duration_raw, "contractDurationInMonths")

            monthly_cost_raw: object = price.get("monthlyCostInCent")
            monthly_cost: int = to_int(monthly_cost_raw, "monthlyCostInCent")

            connection_type_raw: object = info.get("connectionType")
            if not isinstance(connection_type_raw, str):
                connection_type_str: str = (
                    str(connection_type_raw).replace("{", "{{").replace("}", "}}")
                )
                logger.error(
                    f"Invalid connectionType '{connection_type_str}' for pid {pid}"
                )
                return None
            connection_type: str = connection_type_raw

            tv_value_raw: object = info.get("tv")
            tv_package_name_candidate: Optional[str] = (
                tv_value_raw.strip()
                if isinstance(tv_value_raw, str) and tv_value_raw.strip()
                else None
            )
            tv_package_name: Optional[str] = tv_package_name_candidate
            tv_included: bool = bool(tv_package_name)

            data_cap: Optional[int] = None
            if "limitFrom" in info:
                limit_from_raw: object = info.get("limitFrom")
                try:
                    data_cap = to_int(limit_from_raw, "limitFrom")
                except ValueError:
                    data_cap = None

            max_age: Optional[int] = None
            if "maxAge" in info:
                max_age_raw: object = info.get("maxAge")
                try:
                    max_age = to_int(max_age_raw, "maxAge")
                except ValueError:
                    max_age = None

            installation_val_raw: object = price.get("installationService", False)
            if isinstance(installation_val_raw, bool):
                installation_service_included: bool = installation_val_raw
            else:
                installation_service_included: bool = str(
                    installation_val_raw
                ).strip().lower() in ("yes", "true", "included")

            discount_val_raw: object = prod.get("discount", 0)
            try:
                discount: int = to_int(discount_val_raw, "discount")
            except ValueError:
                discount = 0

            response: ServusSpeedResponse = ServusSpeedResponse(
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
        except Exception as e:
            logger.warning(
                f"Unexpected error parsing Servus Speed response for pid {pid}: {e}"
            )
            return None
