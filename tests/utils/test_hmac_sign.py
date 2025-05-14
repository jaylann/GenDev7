import pytest
import json
import hashlib
import hmac
from pydantic import BaseModel, Field

from app.utils.hmac_sign import sign


class SimpleModel(BaseModel):
    foo: str
    bar: int


def test_sign_valid_simple_model():
    model = SimpleModel(foo="hello", bar=123)
    timestamp = "1672531200"
    secret = "mysecret"
    # Expected compact JSON serialization
    payload = {"foo":"hello","bar":123}
    payload_json = json.dumps(payload, separators=(',',':'))
    expected = hmac.new(
        secret.encode('utf-8'),
        f"{timestamp}:{payload_json}".encode('utf-8'),
        digestmod=hashlib.sha256,
    ).hexdigest()
    result = sign(model, timestamp, secret)
    assert result == expected


class AliasModel(BaseModel):
    my_field: str = Field(alias="myField")
    other: int

    model_config = {
        'populate_by_name': True
    }


def test_sign_respects_alias():
    # Instantiate using alias and field name population
    model = AliasModel(myField="value", other=42)
    timestamp = "1620000000"
    secret = "anothersecret"
    # Expect alias key in JSON
    payload = {"myField":"value","other":42}
    payload_json = json.dumps(payload, separators=(',',':'))
    expected = hmac.new(
        secret.encode('utf-8'),
        f"{timestamp}:{payload_json}".encode('utf-8'),
        digestmod=hashlib.sha256,
    ).hexdigest()
    assert sign(model, timestamp, secret) == expected


@pytest.mark.parametrize("timestamp", [None, "", 123, [], {}])
def test_sign_invalid_timestamp(timestamp):
    model = SimpleModel(foo="a", bar=1)
    with pytest.raises(TypeError) as excinfo:
        sign(model, timestamp, "secret")
    assert "`timestamp` must be a non-empty str" in str(excinfo.value)


@pytest.mark.parametrize("secret", [None, "", 456, [], {}])
def test_sign_invalid_secret(secret):
    model = SimpleModel(foo="a", bar=1)
    with pytest.raises(TypeError) as excinfo:
        sign(model, "123", secret)
    assert "`secret` must be a non-empty str" in str(excinfo.value)


class BadModel(BaseModel):
    def model_dump(self, by_alias: bool = False):
        raise ValueError("serialize error")

def test_sign_serialization_error():
    model = BadModel()
    with pytest.raises(RuntimeError) as excinfo:
        sign(model, "123", "secret")
    assert "Failed to serialize payload" in str(excinfo.value)


def test_sign_hmac_error(monkeypatch):
    model = SimpleModel(foo="test", bar=2)
    timestamp = "1000"
    secret = "sec"
    # Simulate HMAC computation failure
    def fake_new(key, msg, digestmod):
        raise RuntimeError("hmac failure")
    monkeypatch.setattr(hmac, "new", fake_new)
    with pytest.raises(RuntimeError) as excinfo:
        sign(model, timestamp, secret)
    assert "Failed to compute HMAC signature" in str(excinfo.value)
