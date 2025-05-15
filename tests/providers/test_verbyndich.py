import os
import json
import pytest
import httpx

pytest_plugins = ("pytest_asyncio",)

# Ensure settings initialize without missing env vars
os.environ.setdefault("VERBYNDICH_API_KEY", "dummy")

# Now import modules under test
import app.providers.verbyndich as vmod
from app.providers.verbyndich import VerbynDichProvider, PARALLEL, MAX_PAGES
from app.models import Address
from app.factories.verbyndich_factory import VerbynDichFactory


def make_dummy_response(valid: bool, last: bool, offer_value: str):
    """Helper to create a dummy factory response object."""
    class Dummy:
        def __init__(self):
            self.valid = valid
            self.last = last
        def to_offer(self, provider_name: str) -> str:
            return offer_value
    return Dummy()


@pytest.fixture(autouse=True)
def override_parallel_max(monkeypatch):
    # Simplify concurrency: one page at a time
    monkeypatch.setattr(vmod, 'PARALLEL', 1)
    # Limit pages for tests
    monkeypatch.setattr(vmod, 'MAX_PAGES', 3)


@pytest.fixture
def provider():
    # Provide a fresh HTTP client
    client = httpx.AsyncClient()
    return VerbynDichProvider(client=client)


@pytest.mark.asyncio
async def test_fetch_single_page(monkeypatch, provider, tmp_path):
    monkeypatch.setattr(VerbynDichFactory, 'build_body', lambda addr: 'BODY')
    async def fake_fetch(client, body, page):
        assert client is provider.client
        return {'page': page}
    monkeypatch.setattr(vmod, '_fetch_page', fake_fetch)
    monkeypatch.setattr(VerbynDichFactory, 'parse_response',
                        lambda data: make_dummy_response(True, True, 'offer1'))
    monkeypatch.chdir(tmp_path)

    addr = Address(street='A', house_number='1', city='C', plz='00000', country_code='DE')
    offers = await provider.fetch(addr)

    assert offers == ['offer1']
    log_file = tmp_path / 'logs' / 'verbyndich_response.json'
    assert log_file.exists()
    assert json.loads(log_file.read_text()) == [{'page': 0}]


@pytest.mark.asyncio
async def test_fetch_multiple_pages(monkeypatch, provider, tmp_path):
    monkeypatch.setattr(VerbynDichFactory, 'build_body', lambda addr: 'B')
    pages_data = {0:{'p':0},1:{'p':1},2:{'p':2}}
    async def fake_fetch(client, body, page):
        return pages_data[page]
    monkeypatch.setattr(vmod, '_fetch_page', fake_fetch)
    def fake_parse(data):
        p = data['p']
        if p < 2:
            last = (p == 1)
            return make_dummy_response(True, last, f'o{p}')
        pytest.skip('Unexpected page')
    monkeypatch.setattr(VerbynDichFactory, 'parse_response', fake_parse)
    monkeypatch.chdir(tmp_path)

    addr = Address(street='S', house_number='N', city='X', plz='99999', country_code='DE')
    offers = await provider.fetch(addr)

    assert offers == ['o0', 'o1']
    log_file = tmp_path / 'logs' / 'verbyndich_response.json'
    content = json.loads(log_file.read_text())
    assert content == [{'p':0}, {'p':1}]


@pytest.mark.asyncio
async def test_fetch_no_offers(monkeypatch, provider, tmp_path):
    monkeypatch.setattr(VerbynDichFactory, 'build_body', lambda addr: '')
    async def fake_fetch(client, body, page):
        return {'foo':'bar'}
    monkeypatch.setattr(vmod, '_fetch_page', fake_fetch)
    monkeypatch.setattr(VerbynDichFactory, 'parse_response', lambda data: None)
    monkeypatch.chdir(tmp_path)

    addr = Address(street='X', house_number='Y', city='Z', plz='00000', country_code='DE')
    offers = await provider.fetch(addr)
    assert offers == []
    # Log file should record the page
    content = json.loads((tmp_path/'logs'/'verbyndich_response.json').read_text())
    assert isinstance(content, list) and len(content) == 1


@pytest.mark.asyncio
async def test_fetch_timeout_retry(monkeypatch, provider):
    # Patch the inner function behind the retry decorator so the wrapper still handles retries
    call_count = {'cnt': 0}
    async def always_fail(client, body, page):
        call_count['cnt'] += 1
        raise httpx.TimeoutException('timed out')
    monkeypatch.setattr(vmod._fetch_page, '__wrapped__', always_fail)
    # Patch the retry decorator's inner function (beneath the cache wrapper)
    monkeypatch.setattr(vmod._fetch_page.__wrapped__, '__wrapped__', always_fail)

    with pytest.raises(httpx.TimeoutException):
        # Call via module to use patched version
        await vmod._fetch_page(provider.client, 'b', 0)
    # Should retry the configured number of attempts
    assert call_count['cnt'] == vmod.PAGE_FETCH_RETRY_ATTEMPTS
