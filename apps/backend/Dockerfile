# Obrigada backend image.
# Build context is the REPO ROOT (needs the pnpm workspace + packages/shared):
#   docker build -f apps/backend/Dockerfile -t obrigada-backend .
# syntax=docker/dockerfile:1

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @obrigada/shared build && pnpm --filter @obrigada/backend build
# Produce a self-contained, prod-only deployment of the backend package.
# --legacy: pnpm 10 requires injected workspaces otherwise; legacy packing copies
# the workspace deps (@obrigada/shared) into the deploy output, which is what we want.
RUN pnpm --filter @obrigada/backend deploy --legacy --prod /app/deploy

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/deploy ./
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
