"""Application configuration for the FPL agent server.

Uses pydantic-settings to load configuration from environment variables.
M2 adds FPL_API_BASE and REDIS_URL for the data layer.
Supabase service key deferred to M4 (agent_runs writes).
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

    # FPL API
    fpl_api_base: str = "https://fantasy.premierleague.com/api"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Anthropic model
    anthropic_model: str = "claude-sonnet-4-5"


settings = Settings()
