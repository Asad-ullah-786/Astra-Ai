import os
import tempfile
from collections.abc import Iterator
from pathlib import Path

_TEMP = tempfile.mkdtemp(prefix="astra-test-")
_DATABASE = Path(_TEMP) / "test.db"
os.environ["ASTRA_ENV"] = "test"
os.environ["ASTRA_DATABASE_URL"] = f"sqlite+aiosqlite:///{_DATABASE.as_posix()}"
os.environ["ASTRA_API_TOKEN"] = ""
os.environ["ASTRA_LOG_LEVEL"] = "WARNING"
os.environ["ASTRA_STATS_INTERVAL"] = "30"

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="session")
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client
