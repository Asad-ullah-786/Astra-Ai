from functools import lru_cache
import os
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent
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
        validation_alias=AliasChoices("ASTRA_DATABASE_URL", "DATABASE_URL", "POSTGRES_URL"),
    )
    cors_origins: str = Field(
        default="http://127.0.0.1:5173,http://localhost:5173,https://astra-ai-786.vercel.app",
        alias="ASTRA_CORS_ORIGINS",
    )
    stats_interval_seconds: float = Field(default=2.0, alias="ASTRA_STATS_INTERVAL")
    ollama_url: str = Field(default="http://127.0.0.1:11434", alias="ASTRA_OLLAMA_URL")
    ollama_api_key: str = Field(default="", alias="ASTRA_OLLAMA_API_KEY")
    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_vercel_deployment(self) -> bool:
        return os.environ.get("VERCEL") == "1"

    @property
    def auth_required(self) -> bool:
        return self.is_vercel_deployment or bool(self.api_token.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
