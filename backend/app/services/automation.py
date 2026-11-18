import os
from pathlib import Path
import shutil
import subprocess
import sys


class AutomationError(RuntimeError):
    pass


APPLICATION_LABELS = {
    "code": "Visual Studio Code",
    "chrome": "Google Chrome",
    "settings": "Windows Settings",
}


def _application_path(application: str) -> str:
    if application not in APPLICATION_LABELS:
        raise AutomationError("Choose an application from the approved list.")
    if application == "settings":
        return "ms-settings:"

    executable = "code" if application == "code" else "chrome"
    found = shutil.which(executable)
    if found:
        return found

    roots = [
        Path(os.environ.get("LOCALAPPDATA", "")),
        Path(os.environ.get("PROGRAMFILES", "C:\\Program Files")),
        Path(os.environ.get("PROGRAMFILES(X86)", "C:\\Program Files (x86)")),
    ]
    relative = (
        Path("Programs/Microsoft VS Code/Code.exe")
        if application == "code"
        else Path("Google/Chrome/Application/chrome.exe")
    )
    for root in roots:
        if str(root) and (candidate := root / relative).is_file():
            return str(candidate)
    raise AutomationError(f"{APPLICATION_LABELS[application]} is not installed or was not found.")


def launch_application(application: str) -> str:
    if sys.platform != "win32":
        raise AutomationError("Windows quick commands are available only on Windows.")
    target = _application_path(application)
    if application == "settings":
        os.startfile(target)
    else:
        subprocess.Popen(
            [target],
            close_fds=True,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    return f"Opened {APPLICATION_LABELS[application]}."


def available_applications() -> list[str]:
    if sys.platform != "win32":
        return []
    available = ["settings"]
    for application in ("code", "chrome"):
        try:
            _application_path(application)
        except AutomationError:
            continue
        available.append(application)
    return available
