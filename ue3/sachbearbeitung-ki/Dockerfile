# Multi-Stage-Build mit pnpm-Workspace-Awareness.
#
# Wichtig: Build-Context ist die Repo-Root (siehe docker-compose.yml
# `context: ../../..`), damit der Container Zugriff auf
# packages/data-layer und packages/foerderbereiche hat.
FROM node:22-alpine AS build
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# WICHTIG: Wenn hier ein neues @dv/*-Paket dazukommt, beide Stellen
# ergänzen (Manifest-Copy + Quellen-Copy unten), sonst bricht pnpm install.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/data-layer/package.json        packages/data-layer/package.json
COPY packages/foerderbereiche/package.json   packages/foerderbereiche/package.json
COPY packages/antrag-renderer/package.json   packages/antrag-renderer/package.json
COPY ue3/sachbearbeitung-ki/package.json     ue3/sachbearbeitung-ki/package.json

RUN pnpm install --frozen-lockfile --filter amt-ki-sachbearbeitung...

COPY packages/data-layer        packages/data-layer
COPY packages/foerderbereiche   packages/foerderbereiche
COPY packages/antrag-renderer   packages/antrag-renderer
COPY ue3/sachbearbeitung-ki     ue3/sachbearbeitung-ki

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_AUTH_REDIRECT
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_AUTH_REDIRECT=$VITE_AUTH_REDIRECT

WORKDIR /repo/ue3/sachbearbeitung-ki
RUN pnpm build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY --from=build /repo/ue3/sachbearbeitung-ki/dist /usr/share/nginx/html
COPY ue3/sachbearbeitung-ki/docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
