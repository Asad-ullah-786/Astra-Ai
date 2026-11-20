import pytest

from app.services.device_bridge import DeviceBridge, validate_public_url


def test_pairing_code_is_single_use_and_session_can_be_revoked():
    bridge = DeviceBridge()
    code = bridge.start()

    token = bridge.pair(code.lower())

    assert token is not None
    assert bridge.is_authorized(f"Bearer {token}")
    assert bridge.pair(code) is None
    assert not bridge.is_authorized(f"Bearer {token} trailing")
    assert bridge.revoke(f"Bearer {token}")
    assert not bridge.is_authorized(f"Bearer {token}")


def test_pairing_code_expires(monkeypatch):
    now = [100.0]
    monkeypatch.setattr("app.services.device_bridge.time.monotonic", lambda: now[0])
    bridge = DeviceBridge()
    code = bridge.start()
    now[0] += 301

    assert bridge.pair(code) is None


def test_five_bad_pairing_attempts_lock_the_current_code():
    bridge = DeviceBridge()
    code = bridge.start()

    for _ in range(5):
        assert bridge.pair("00000000") is None

    assert bridge.pair(code) is None
    assert bridge.pair(bridge.start()) is not None


@pytest.mark.parametrize(
    "url",
    [
        "javascript:alert(1)",
        "file:///C:/Users",
        "http://localhost:8787",
        "http://127.0.0.1:8787",
        "http://127.1",
        "http://0x7f000001",
        "http://192.168.1.1",
        "http://printer.local",
        "https://user:password@example.com",
        "https://example.com:99999",
    ],
)
def test_rejects_non_public_or_credential_bearing_urls(url):
    with pytest.raises(ValueError):
        validate_public_url(url)


@pytest.mark.parametrize("url", ["https://example.com", "http://example.org/path"])
def test_accepts_public_web_urls(url):
    assert validate_public_url(url) == url
