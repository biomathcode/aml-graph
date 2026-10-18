# syntax=docker/dockerfile:1
# Omitting precompiled bytecode (--no-compile) plus the pip cache mount keeps
# the image lean; nothing here needs a compiler, so no build-essential.
# pip/setuptools are build-tooling only — uninstalled in the same RUN so the
# final layer genuinely excludes them.

FROM python:3.11-slim
WORKDIR /app
# Don't grow the writable layer with .pyc files at every import.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-compile --no-cache-dir --timeout 600 --retries 20 -r requirements.txt \
 && pip uninstall -y -q pip setuptools wheel

COPY . .
EXPOSE 8001
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/health')" || exit 1
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
