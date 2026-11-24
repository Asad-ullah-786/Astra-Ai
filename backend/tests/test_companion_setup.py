from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def test_companion_installer_installs_async_sqlite_driver():
    installer = (PROJECT_ROOT / "install_companion.bat").read_text(encoding="utf-8")
    requirements = (
        PROJECT_ROOT / "backend" / "requirements-vercel.txt"
    ).read_text(encoding="utf-8")
    dependencies = {
        line.split("==", maxsplit=1)[0].strip().lower()
        for line in requirements.splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }

    assert r"backend\requirements-vercel.txt" in installer
    assert "aiosqlite" in dependencies
