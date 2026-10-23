FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --workspace backend --include-workspace-root
COPY tsconfig.base.json ./
COPY backend backend
RUN npm run build --workspace backend

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --omit=dev --workspace backend --include-workspace-root=false && npm cache clean --force
COPY --from=build --chown=node:node /app/backend/dist backend/dist
COPY --chown=node:node database database
USER node
EXPOSE 3000
CMD ["sh", "-c", "node backend/dist/db/manage.js migrate && exec node backend/dist/server.js"]
