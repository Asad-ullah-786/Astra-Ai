from datetime import datetime, timezone

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class HealthResponse(BaseModel):
    name: str
    version: str
    phase: int
    status: str
    database: str
    auth_required: bool
    cloud_deployment: bool = False
    model: str
    time_utc: datetime


class AccountOut(BaseModel):
    id: str
    email: str | None = None
    is_guest: bool = True


class AccountSessionOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    account: AccountOut


class AIUsageOut(BaseModel):
    used_today: int
    daily_limit: int | None
    remaining: int | None


class SystemSnapshot(BaseModel):
    cpu_percent: float
    cpu_count: int
    ram_percent: float
    ram_used_gb: float
    ram_total_gb: float
    battery_percent: float | None
    battery_plugged: bool | None
    disk_path: str
    disk_percent: float
    disk_free_gb: float
    disk_total_gb: float
    platform: str
    hostname: str
    python: str
    system_uptime_seconds: int
    app_uptime_seconds: int


class ModuleInfo(BaseModel):
    id: str
    name: str
    phase: int
    status: str
    summary: str


class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    created_at: datetime


class ConversationOut(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime
    messages: list[MessageOut] = Field(default_factory=list)


class ConversationSummary(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime


class CommandIn(BaseModel):
    text: str
    conversation_id: str | None = None
    response_language: str | None = Field(
        default=None,
        max_length=12,
        pattern=r"^[a-z]{2,3}(?:-[A-Z]{2})?$",
    )


class CommandOut(BaseModel):
    conversation_id: str
    user_message: MessageOut
    assistant_message: MessageOut
    state: str
    model: str


class ActivityOut(BaseModel):
    id: str
    created_at: datetime
    level: str
    source: str
    message: str
    details: str | None


class SettingsOut(BaseModel):
    user_display_name: str


class SettingsIn(BaseModel):
    user_display_name: str


class InstalledModelOut(BaseModel):
    name: str
    size: int
    parameter_size: str | None
    modified_at: str | None


class GeminiStatusOut(BaseModel):
    configured: bool = False
    connected: bool = False
    models: list[str] = Field(default_factory=list)
    error: str | None = None


class AIStatusOut(BaseModel):
    connected: bool
    selected_model: str | None
    models: list[InstalledModelOut] = Field(default_factory=list)
    clients: dict[str, bool] = Field(default_factory=dict)
    gemini: GeminiStatusOut = Field(default_factory=GeminiStatusOut)
    openai: GeminiStatusOut = Field(default_factory=GeminiStatusOut)
    error: str | None = None


class ModelSelectionIn(BaseModel):
    model: str = Field(min_length=1, max_length=120)


class TaskCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    notes: str | None = Field(default=None, max_length=2000)
    due_at: datetime | None = None

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Task title cannot be empty.")
        return cleaned

    @field_validator("notes")
    @classmethod
    def clean_notes(cls, value: str | None) -> str | None:
        cleaned = value.strip() if value is not None else None
        return cleaned or None

    @field_validator("due_at")
    @classmethod
    def require_timezone(cls, value: datetime | None) -> datetime | None:
        if value is not None:
            if value.tzinfo is None or value.utcoffset() is None:
                raise ValueError("Due date must include a timezone.")
            return value.astimezone(timezone.utc)
        return None


class TaskUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    notes: str | None = Field(default=None, max_length=2000)
    due_at: datetime | None = None
    completed: bool = False
    in_progress: bool = False

    @model_validator(mode="before")
    @classmethod
    def reject_null_title(cls, value: object) -> object:
        if isinstance(value, dict) and "title" in value and value["title"] is None:
            raise ValueError("Task title cannot be null.")
        return value

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Task title cannot be empty.")
        return cleaned

    @field_validator("notes")
    @classmethod
    def clean_notes(cls, value: str | None) -> str | None:
        cleaned = value.strip() if value is not None else None
        return cleaned or None

    @field_validator("due_at")
    @classmethod
    def require_timezone(cls, value: datetime | None) -> datetime | None:
        if value is not None:
            if value.tzinfo is None or value.utcoffset() is None:
                raise ValueError("Due date must include a timezone.")
            return value.astimezone(timezone.utc)
        return None


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    notes: str | None
    due_at: datetime | None
    completed: bool
    in_progress: bool
    reminded_at: datetime | None
    created_at: datetime
    updated_at: datetime

    @field_validator("due_at", "reminded_at", "created_at", "updated_at", mode="before")
    @classmethod
    def normalize_datetime(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None or value.utcoffset() is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class VoiceStatusOut(BaseModel):
    ready: bool
    dependencies_installed: bool
    model: str
    languages: list[str]
    message: str


class VoiceTranscriptionOut(BaseModel):
    text: str
    language: str
    duration_seconds: float


class MemoryCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    content: str = Field(min_length=1, max_length=2000)

    @field_validator("title", "content")
    @classmethod
    def clean_required_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Memory title and content cannot be empty.")
        return cleaned


class MemoryUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    content: str | None = Field(default=None, min_length=1, max_length=2000)

    @model_validator(mode="before")
    @classmethod
    def require_a_field(cls, value: object) -> object:
        if isinstance(value, dict) and not value:
            raise ValueError("Provide a title or content to update.")
        return value

    @field_validator("title", "content")
    @classmethod
    def clean_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Memory title and content cannot be empty.")
        return cleaned


class MemoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    content: str
    created_at: datetime
    updated_at: datetime


class AutomationLaunchIn(BaseModel):
    application: Literal["code", "cursor", "chrome", "settings", "notepad", "calculator", "explorer"]


class AutomationLaunchOut(BaseModel):
    application: str
    message: str


class DevicePairIn(BaseModel):
    pairing_code: str = Field(min_length=8, max_length=8, pattern=r"^[A-Fa-f0-9]{8}$")


class DevicePairOut(BaseModel):
    access_token: str
    expires_in: int


class DeviceActionIn(BaseModel):
    action: Literal["launch_app", "open_url"]
    application: Literal["code", "cursor", "chrome", "settings", "notepad", "calculator", "explorer"] | None = None
    url: str | None = Field(default=None, max_length=2048)

    @model_validator(mode="after")
    def validate_action_parameters(self):
        if self.action == "launch_app" and (self.application is None or self.url is not None):
            raise ValueError("Choose one approved application.")
        if self.action == "open_url" and (self.url is None or self.application is not None):
            raise ValueError("Provide one URL to open.")
        return self


class DeviceAIMessageIn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class DeviceAIChatIn(BaseModel):
    model: str = Field(min_length=1, max_length=120)
    messages: list[DeviceAIMessageIn] = Field(min_length=1, max_length=40)


class LocalCommandResultIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    reply: str = Field(min_length=1, max_length=16000)
    conversation_id: str | None = None
    model: str = Field(min_length=1, max_length=120)


class ResearchSearchIn(BaseModel):
    query: str = Field(min_length=2, max_length=300)

    @field_validator("query")
    @classmethod
    def clean_query(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if len(cleaned) < 2:
            raise ValueError("Enter a search query with at least two characters.")
        return cleaned


class ResearchResultOut(BaseModel):
    title: str
    url: str
    snippet: str


class ResearchSearchOut(BaseModel):
    query: str
    results: list[ResearchResultOut]
