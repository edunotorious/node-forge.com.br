# syntax=docker/dockerfile:1
FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    NODE_ENV=development

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

# Install dependencies first for cache-friendly rebuilds (this layer only
# invalidates when package.json or pnpm-lock.yaml change).
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy the rest of the project (overlaid by a bind-mount in docker-compose
# during dev, so changes hot-reload without a rebuild).
COPY . .

EXPOSE 3000

# `next dev` includes hot reload and Turbopack by default in Next 16.
CMD ["pnpm", "dev"]
