# Stage 1 — dependency resolution with uv
FROM python:3.11-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Copy dependency spec + lockfile first (cache layer).
# --frozen guarantees the installed versions match what tests ran against.
COPY pyproject.toml uv.lock ./
COPY src/fpl_agent/__init__.py src/fpl_agent/

# Install dependencies into /app/.venv
# --frozen: fail if uv.lock is out of sync with pyproject.toml
# --no-dev: skip pytest etc in the production image
# --no-cache: don't cache the uv download cache inside the layer
RUN uv sync --frozen --no-dev --no-cache

# Stage 2 — production image
FROM python:3.11-slim AS runtime

WORKDIR /app

# Copy the venv from builder
COPY --from=builder /app/.venv /app/.venv

# Copy source
COPY src/ src/

# Activate venv by prepending to PATH
ENV PATH="/app/.venv/bin:$PATH"
# Python won't write .pyc files (cleaner container FS)
ENV PYTHONDONTWRITEBYTECODE=1
# Unbuffered output — critical for Railway log streaming
ENV PYTHONUNBUFFERED=1

# Single worker — enforced by the APScheduler singleton constraint.
# Do NOT add --workers N without reading design doc §5 and §11 first.
# Uses $PORT when set (Railway injects it); falls back to 8000 otherwise.
CMD ["sh", "-c", "uvicorn fpl_agent.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
