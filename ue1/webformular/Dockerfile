# Multi-Stage-Build mit pnpm-Workspace-Awareness (analog UE2/UE3/UE0).
# Build-Context = Repo-Root für Zugriff auf packages/foerderbereiche + data-layer.
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/data-layer/package.json        packages/data-layer/package.json
COPY packages/foerderbereiche/package.json   packages/foerderbereiche/package.json
COPY ue1/webformular/package.json            ue1/webformular/package.json

RUN pnpm install --frozen-lockfile --filter ue1-webformular...

COPY packages/data-layer        packages/data-layer
COPY packages/foerderbereiche   packages/foerderbereiche
COPY ue1/webformular            ue1/webformular

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_PRUEFUNG_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_PRUEFUNG_URL=$VITE_PRUEFUNG_URL

WORKDIR /repo/ue1/webformular
RUN pnpm build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY --from=build /repo/ue1/webformular/dist /usr/share/nginx/html
COPY ue1/webformular/docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
