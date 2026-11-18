import os
from importlib.util import find_spec
import tempfile
from functools import lru_cache
from pathlib import Path
from threading import Lock

from app.config import DATA_DIR

MODEL_NAME = "faster-whisper-tiny"
MODEL_REPOSITORY = "Systran/faster-whisper-tiny"
MODEL_DIRECTORY = DATA_DIR / "models" / MODEL_NAME
MODEL_FILES = ("config.json", "model.bin", "tokenizer.json", "vocabulary.txt")

_download_lock = Lock()


def voice_dependencies_installed() -> bool:
    return find_spec("faster_whisper") is not None and find_spec("huggingface_hub") is not None


def voice_model_installed() -> bool:
    return all((MODEL_DIRECTORY / filename).is_file() for filename in MODEL_FILES)


def download_voice_model() -> None:
    if not voice_dependencies_installed():
        raise RuntimeError("Install backend requirements before downloading the speech model.")
    from huggingface_hub import snapshot_download

    with _download_lock:
        if voice_model_installed():
            return
        snapshot_download(
            repo_id=MODEL_REPOSITORY,
            local_dir=str(MODEL_DIRECTORY),
            allow_patterns=[*MODEL_FILES, "preprocessor_config.json"],
        )
        if not voice_model_installed():
            raise RuntimeError("The downloaded speech model is missing required files.")
        _load_model.cache_clear()


@lru_cache(maxsize=1)
def _load_model():
    if not voice_model_installed():
        raise RuntimeError("Download the local speech model before transcribing audio.")
    if not voice_dependencies_installed():
        raise RuntimeError("Install backend requirements before transcribing audio.")
    from faster_whisper import WhisperModel

    return WhisperModel(
        str(MODEL_DIRECTORY),
        device="cpu",
        compute_type="int8",
        cpu_threads=max(1, min(4, os.cpu_count() or 1)),
    )


def transcribe_audio(audio: bytes, suffix: str, language: str | None) -> tuple[str, str, float]:
    with tempfile.NamedTemporaryFile(prefix="astra-voice-", suffix=suffix, delete=False) as audio_file:
        audio_file.write(audio)
        audio_path = Path(audio_file.name)

    try:
        segments, details = _load_model().transcribe(
            str(audio_path),
            language=language,
            beam_size=1,
            vad_filter=True,
        )
        text = " ".join(segment.text.strip() for segment in segments).strip()
        if not text:
            raise ValueError("No speech was detected. Try speaking closer to the microphone.")
        return text, details.language, float(details.duration)
    finally:
        audio_path.unlink(missing_ok=True)
