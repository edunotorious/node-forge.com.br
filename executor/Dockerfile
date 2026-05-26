# syntax=docker/dockerfile:1
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1

# matplotlib's Agg backend works without a display, but qiskit's textbook
# style still pulls in libgomp and a couple of fonts. Keep this list lean —
# every byte here is part of the user-code blast radius until we move to an
# ephemeral runner image.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.11.12 /uv /uvx /usr/local/bin/

WORKDIR /app

# Resolve and install deps first — separate layer so source edits don't blow
# the qiskit install cache (it's heavy).
COPY pyproject.toml ./
RUN uv pip install --system .

COPY src ./src

# Runner-mode scratch dir. The executor reuses this same image for each
# ephemeral runner container; user code lands at /work/script.py with
# `nobody` owning the dir so the runner can drop root via `user=nobody`.
RUN mkdir -p /work && chown nobody:nogroup /work && chmod 1777 /work

EXPOSE 8001

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8001"]
