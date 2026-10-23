FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
RUN npm ci --workspace frontend --include-workspace-root
COPY tsconfig.base.json ./
COPY frontend frontend
ARG VITE_API_BASE_URL=/api
ARG VITE_MAP_STYLE_URL=
ARG VITE_BAGUA_MASTER_ENABLED=true
ARG VITE_MUNICIPAL_MAP_ENABLED=true
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_MAP_STYLE_URL=$VITE_MAP_STYLE_URL
ENV VITE_BAGUA_MASTER_ENABLED=$VITE_BAGUA_MASTER_ENABLED
ENV VITE_MUNICIPAL_MAP_ENABLED=$VITE_MUNICIPAL_MAP_ENABLED
RUN npm run build --workspace frontend

FROM nginx:1.28-alpine AS runtime
COPY infrastructure/nginx/frontend.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 8080
