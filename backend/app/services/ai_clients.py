import shutil

from app.services.automation import AutomationError, _application_path


def _application_is_available(application: str) -> bool:
    try:
        _application_path(application)
    except AutomationError:
        return False
    return True


def available_ai_clients() -> dict[str, bool]:
    chrome_available = _application_is_available("chrome")
    return {
        "claude_code": shutil.which("claude") is not None,
        "cursor": _application_is_available("cursor"),
        "copilot": _application_is_available("code") or shutil.which("copilot") is not None,
        "browser_agent": chrome_available,
    }
