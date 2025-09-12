# --- Stage 1: build SPA ---
FROM node:20-alpine AS builder
WORKDIR /web

# deps
COPY ./WebClient/package*.json ./
RUN npm ci

# sources
COPY ./WebClient/ ./

# vite env (прокидываются из docker-compose -> ARG)
ARG VITE_API_BASE
ARG VITE_HUB_URL
ENV VITE_API_BASE=$VITE_API_BASE
ENV VITE_HUB_URL=$VITE_HUB_URL

RUN npm run build

# --- Stage 2: nginx ---
FROM nginx:1.27-alpine

# наш конфиг nginx
COPY default.conf /etc/nginx/conf.d/default.conf

# собранный фронт
COPY --from=builder /web/dist /usr/share/nginx/html

# каталог для alias (том примонтируем поверх)
RUN mkdir -p /var/www/avatars
