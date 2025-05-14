# tests/test_slug.py
import base64
import zlib

import pytest

from app.utils.slug import _b64encode, _b64decode, encode, decode


@pytest.mark.parametrize(
    "raw",
    [
        b"",  # empty
        b"a",  # length mod 1
        b"ab",  # length mod 2
        b"abc",  # length mod 3
        b"hello world",  # typical
        b"\x00\xff\x10\x80",  # arbitrary bytes
    ],
)
def test_b64_roundtrip(raw: bytes) -> None:
    """_b64encode and _b64decode should be true inverses."""
    slug = _b64encode(raw)
    # slug should be urlsafe and have no padding
    assert "=" not in slug
    restored = _b64decode(slug)
    assert restored == raw


def test_b64decode_invalid() -> None:
    """Invalid base64 data should raise an error."""
    with pytest.raises((base64.binascii.Error, ValueError)):
        _b64decode("not-a-valid-base64!")


@pytest.mark.parametrize(
    "payload",
    [
        {},  # empty dict
        {"a": 1, "b": "two", "c": True, "d": None},
        {"nested": {"x": [1, 2, 3], "y": {"z": "deep"}}},
        {"unicode": "こんにちは世界"},
        {"mixed": [1, "two", {"three": 3}], "flag": False},
    ],
)
def test_encode_decode_roundtrip(payload: dict) -> None:
    """encode → decode should round-trip any JSON-serializable dict."""
    slug = encode(payload)
    # must be a str and not contain '=' padding
    assert isinstance(slug, str)
    assert "=" not in slug

    result = decode(slug)
    # JSON loads always produce native Python types
    assert result == payload


def test_encode_strips_padding_for_known_input() -> None:
    """
    For a known payload we can assert that the slug has no '=' at the end,
    even though zlib compress + base64 normally would.
    """
    payload = {"foo": "bar"}
    slug = encode(payload)
    assert slug.endswith("=") is False
    # And we still roundtrip
    assert decode(slug) == payload


def test_encode_non_serializable() -> None:
    """Non-JSON-serializable payloads should raise TypeError."""

    class Foo:
        pass

    with pytest.raises(TypeError):
        encode({"bad": Foo()})


def test_decode_tampered_slug() -> None:
    """
    If someone tampers with the slug such that decompression fails,
    decode should propagate the error.
    """
    payload = {"foo": "bar"}
    slug = encode(payload)
    # corrupt one character
    tampered = slug[:-1] + ("A" if slug[-1] != "A" else "B")
    with pytest.raises(zlib.error):
        decode(tampered)
