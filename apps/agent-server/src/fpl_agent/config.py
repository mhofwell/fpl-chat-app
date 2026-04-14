"""Application configuration for the FPL agent server.

Uses pydantic-settings to load configuration from environment variables.
M2 adds FPL_API_BASE and REDIS_URL for the data layer.
M4b adds SUPABASE_URL + SUPABASE_ANON_KEY for JWT auth and agent_runs writes.
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

    # Supabase — JWT auth + agent_runs persistence
    supabase_url: str = ""  # e.g., "https://xxx.supabase.co" (no trailing slash)
    supabase_anon_key: str = ""  # anon key for user-scoped writes with forwarded JWT
    supabase_jwt_algorithm: str = "ES256"  # Supabase default; legacy projects use RS256

    # CORS — allowed browser origins for /agent/run
    # Comma-separated string when loaded from env (pydantic-settings splits it).
    cors_allowed_origins: list[str] = ["http://localhost:3000"]


settings = Settings()
