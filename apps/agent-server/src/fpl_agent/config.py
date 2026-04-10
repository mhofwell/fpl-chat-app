"""Application configuration for the FPL agent server.

Uses pydantic-settings to load configuration from environment variables.
M1 contains only the vars needed to boot and run /health.
M2 adds: FPL_API_BASE, REDIS_URL, SUPABASE_URL, SUPABASE_SERVICE_KEY.
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Logging
    log_level: str = "INFO"

    # Anthropic — present in root .env as CLAUDE_API_KEY.
    # Not used until M4; present here so misconfigured deploys are caught early.
    claude_api_key: str = ""

    # Service identity — used in structured log output
    service_name: str = "fpl-agent-server"


settings = Settings()
