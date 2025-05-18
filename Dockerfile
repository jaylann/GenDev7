# syntax=docker/dockerfile:1
FROM python:3.12-slim AS base

# --- system & runtime settings ---------------------------------------------
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Add a non-root user for better security
RUN addgroup --system app && adduser --system --ingroup app app
RUN apt-get update && apt-get install -y curl --no-install-recommends && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# --- dependency layer ------------------------------------------------------
# uv is the new ultra-fast installer; fall back to pip if you prefer
RUN pip install --no-cache-dir uv==0.6.6

COPY pyproject.toml uv.lock requirements*.txt ./
RUN uv pip install --system -r requirements.txt

# --- application code ------------------------------------------------------
COPY . .

USER app

EXPOSE 8000
# 4 workers ≈ 2 × vCPU; tune as needed (GUNICORN_WORKERS env also works)
CMD ["gunicorn", "--bind=0.0.0.0:8000", "--workers=4", "--worker-class=uvicorn.workers.UvicornWorker", "--access-logfile=-", "main:app"]
