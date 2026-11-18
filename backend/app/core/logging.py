import logging
from logging.handlers import RotatingFileHandler

from app.config import LOG_DIR, get_settings

logger = logging.getLogger("astra")


def configure_logging(level: str) -> None:
    logger.handlers.clear()
    logger.setLevel(level.upper())
    formatter = logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s")

    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)
    if not get_settings().is_vercel_deployment:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        file_handler = RotatingFileHandler(
            LOG_DIR / "astra.log",
            maxBytes=1_000_000,
            backupCount=3,
            encoding="utf-8",
        )
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    logger.propagate = False
