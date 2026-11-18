from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = PROJECT_ROOT / "backend"
DATA_DIR = PROJECT_ROOT / "data"
LOG_DIR = PROJECT_ROOT / "logs"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "ASTRA"
    version: str = "0.1.0"
    phase: int = 2
    env: str = Field(default="development", alias="ASTRA_ENV")
    host: str = Field(default="127.0.0.1", alias="ASTRA_HOST")
    port: int = Field(default=8787, alias="ASTRA_PORT")
    log_level: str = Field(default="INFO", alias="ASTRA_LOG_LEVEL")
    api_token: str = Field(default="", alias="ASTRA_API_TOKEN")
    database_url: str = Field(
        default=f"sqlite+aiosqlite:///{(DATA_DIR / 'astra.db').as_posix()}",
        alias="ASTRA_DATABASE_URL",
    )
    cors_origins: str = Field(
        default="http://127.0.0.1:5173,http://localhost:5173",
        alias="ASTRA_CORS_ORIGINS",
    )
    stats_interval_seconds: float = Field(default=2.0, alias="ASTRA_STATS_INTERVAL")
    ollama_url: str = Field(default="http://127.0.0.1:11434", alias="ASTRA_OLLAMA_URL")
    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def auth_required(self) -> bool:
        return bool(self.api_token.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
