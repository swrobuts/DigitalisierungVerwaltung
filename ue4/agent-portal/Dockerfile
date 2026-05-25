# Multi-Stage-Build mit pnpm-Workspace-Awareness (analog UE0/UE1/UE2/UE3).
# Build-Context = Repo-Root für pnpm-lock + Workspace.
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY ue4/agent-portal/package.json   ue4/agent-portal/package.json

RUN pnpm install --frozen-lockfile --filter ue4-agent-portal...

COPY ue4/agent-portal   ue4/agent-portal

ARG VITE_API_BASE
ARG VITE_PRUEFUNG_URL
ENV VITE_API_BASE=$VITE_API_BASE \
    VITE_PRUEFUNG_URL=$VITE_PRUEFUNG_URL

WORKDIR /repo/ue4/agent-portal
RUN pnpm build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY --from=build /repo/ue4/agent-portal/dist /usr/share/nginx/html
COPY ue4/agent-portal/docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
