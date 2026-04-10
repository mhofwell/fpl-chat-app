# Stage 1 — dependency resolution with uv
FROM python:3.11-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Copy dependency spec first (cache layer)
COPY pyproject.toml .
COPY src/fpl_agent/__init__.py src/fpl_agent/

# Install dependencies into /app/.venv
# --no-dev: skip pytest etc in the production image
# --no-cache: don't cache the uv download cache inside the layer
RUN uv sync --no-dev --no-cache

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
CMD ["uvicorn", "fpl_agent.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
