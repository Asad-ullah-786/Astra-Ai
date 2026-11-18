import platform
import time
from pathlib import Path

import psutil

_process_started = time.time()
_cpu_primed = False


def prime_cpu() -> None:
    global _cpu_primed
    psutil.cpu_percent(interval=None)
    _cpu_primed = True


def system_snapshot() -> dict:
    if not _cpu_primed:
        prime_cpu()

    memory = psutil.virtual_memory()
    battery = psutil.sensors_battery()
    disk_root = Path.home().anchor or "C:\\"
    disk = psutil.disk_usage(disk_root)
    return {
        "cpu_percent": round(psutil.cpu_percent(interval=None), 1),
        "cpu_count": psutil.cpu_count(logical=True) or 0,
        "ram_percent": round(memory.percent, 1),
        "ram_used_gb": round(memory.used / (1024**3), 2),
        "ram_total_gb": round(memory.total / (1024**3), 2),
        "battery_percent": None if battery is None else round(battery.percent, 1),
        "battery_plugged": None if battery is None else bool(battery.power_plugged),
        "disk_path": disk_root,
        "disk_percent": round(disk.percent, 1),
        "disk_free_gb": round(disk.free / (1024**3), 2),
        "disk_total_gb": round(disk.total / (1024**3), 2),
        "platform": platform.platform(),
        "hostname": platform.node(),
        "python": platform.python_version(),
        "system_uptime_seconds": int(time.time() - psutil.boot_time()),
        "app_uptime_seconds": int(time.time() - _process_started),
    }
