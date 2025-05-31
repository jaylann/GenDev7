# syntax=docker/dockerfile:1
FROM python:3.12-slim AS base

# --- system & runtime settings ---------------------------------------------
ENV HOME=/home/app \
    XDG_CACHE_HOME=/home/app/.cache \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app

RUN addgroup --system app \
 && adduser  --system --home "$HOME" --shell /usr/sbin/nologin --ingroup app app \
 && mkdir -p "$XDG_CACHE_HOME"

RUN apt-get update \
 && apt-get install -y curl --no-install-recommends \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- dependency layer ------------------------------------------------------
# uv is the new ultra-fast installer; fall back to pip if you prefer
RUN pip install --no-cache-dir uv==0.6.6

COPY pyproject.toml uv.lock requirements*.txt ./
RUN uv pip install --system -r requirements.txt

# --- application code ------------------------------------------------------
COPY . .

RUN chown -R app:app "$HOME" /app

USER app

EXPOSE 8000
CMD ["gunicorn", "--bind=0.0.0.0:8000", "--workers=4", \
     "--worker-class=uvicorn.workers.UvicornWorker", "--access-logfile=-", "main:app"]