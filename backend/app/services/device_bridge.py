import ctypes
import ipaddress
import re
import secrets
import sys
import threading
import time
from urllib.parse import urlsplit

from app.services.automation import AutomationError


PAIRING_CODE_TTL_SECONDS = 300
DEVICE_SESSION_TTL_SECONDS = 12 * 60 * 60


class DeviceBridge:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._pairing_code = ""
        self._pairing_expires_at = 0.0
        self._pairing_attempts = 0
        self._sessions: dict[str, float] = {}

    def start(self) -> str:
        with self._lock:
            self._pairing_code = secrets.token_hex(4).upper()
            self._pairing_expires_at = time.monotonic() + PAIRING_CODE_TTL_SECONDS
            self._pairing_attempts = 0
            self._sessions.clear()
            return self._pairing_code

    def stop(self) -> None:
        with self._lock:
            self._pairing_code = ""
            self._pairing_expires_at = 0.0
            self._pairing_attempts = 0
            self._sessions.clear()

    def pair(self, code: str) -> str | None:
        with self._lock:
            if (
                not self._pairing_code
                or time.monotonic() >= self._pairing_expires_at
            ):
                return None
            if not secrets.compare_digest(code.strip().upper(), self._pairing_code):
                self._pairing_attempts += 1
                if self._pairing_attempts >= 5:
                    self._pairing_code = ""
                return None
            self._pairing_code = ""
            self._pairing_attempts = 0
            token = secrets.token_urlsafe(32)
            self._sessions[token] = time.monotonic() + DEVICE_SESSION_TTL_SECONDS
            return token

    def is_authorized(self, authorization: str) -> bool:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token:
            return False
        now = time.monotonic()
        with self._lock:
            self._sessions = {
                session_token: expires_at
                for session_token, expires_at in self._sessions.items()
                if expires_at > now
            }
            return any(
                expires_at > now and secrets.compare_digest(token, session_token)
                for session_token, expires_at in self._sessions.items()
            )

    def revoke(self, authorization: str) -> bool:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token:
            return False
        with self._lock:
            return self._sessions.pop(token, None) is not None


device_bridge = DeviceBridge()


def confirm_device_action(action: str, origin: str) -> bool:
    if sys.platform != "win32":
        return False
    message = (
        f"{origin} is requesting this one-time action:\n\n{action}\n\n"
        "Allow only if you recognize this request."
    )
    flags = 0x00000004 | 0x00000030 | 0x00000100
    result = ctypes.windll.user32.MessageBoxW(None, message, "ASTRA device permission", flags)
    return result == 6


def validate_public_url(url: str) -> str:
    cleaned = url.strip()
    if "\\" in cleaned or any(character.isspace() or ord(character) < 32 for character in cleaned):
        raise ValueError("The website URL cannot contain whitespace or backslashes.")
    parsed = urlsplit(cleaned)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
    ):
        raise ValueError("Use a complete public http:// or https:// URL without embedded credentials.")
    hostname = parsed.hostname.lower().rstrip(".")
    try:
        port = parsed.port
    except ValueError as exc:
        raise ValueError("The website URL contains an invalid port.") from exc
    if port == 0:
        raise ValueError("The website URL contains an invalid port.")
    if hostname in {"localhost", "localhost.localdomain"} or hostname.endswith(
        (".localhost", ".local", ".internal", ".lan", ".home", ".home.arpa")
    ):
        raise ValueError("Opening local computer or network addresses is not supported.")
    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        address = None
        labels = hostname.split(".")
        if all(re.fullmatch(r"(?:[0-9]+|0x[0-9a-f]+)", label, flags=re.IGNORECASE) for label in labels):
            raise ValueError("Numeric shorthand addresses are not supported.")
    if address is not None and not address.is_global:
        raise ValueError("Opening local or reserved network addresses is not supported.")
    return cleaned


def open_approved_url(url: str) -> str:
    import webbrowser

    safe_url = validate_public_url(url)
    if not webbrowser.open(safe_url, new=2):
        raise AutomationError("The default browser could not open this URL.")
    return f"Opened {safe_url} in your default browser."
