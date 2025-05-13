from __future__ import annotations

from typing import List, Dict, Tuple

from app.models import Offer


def _key(o: Offer) -> Tuple[str, str]:
    return o.provider.lower(), o.product_id.lower()


def merge_offers(raw: List[Offer]) -> List[Offer]:
    """
    * Remove duplicate (provider, product_id) pairs.
    * Order by first-year monthly price, cheapest first.
    """
    seen: Dict[Tuple[str, str], Offer] = {}
    for offer in raw:
        k = _key(offer)
        if k not in seen or offer.price_cents_month < seen[k].price_cents_month:
            seen[k] = offer

    return sorted(seen.values(), key=lambda o: o.price_cents_month)
