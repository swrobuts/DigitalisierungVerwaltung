# Multi-Stage-Build mit pnpm-Workspace-Awareness (analog UE2/UE3).
# Build-Context = Repo-Root für Zugriff auf packages/foerderbereiche.
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/foerderbereiche/package.json   packages/foerderbereiche/package.json
COPY ue0/upload-portal/package.json          ue0/upload-portal/package.json

RUN pnpm install --frozen-lockfile --filter ue0-upload-portal...

COPY packages/foerderbereiche   packages/foerderbereiche
COPY ue0/upload-portal          ue0/upload-portal

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_PRUEFUNG_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_PRUEFUNG_URL=$VITE_PRUEFUNG_URL

WORKDIR /repo/ue0/upload-portal
RUN pnpm build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY --from=build /repo/ue0/upload-portal/dist /usr/share/nginx/html
COPY ue0/upload-portal/docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
