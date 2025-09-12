# ---------- Stage 1: сборка фронта ----------
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

# копируем всё нужное для vite/tsc
COPY tsconfig*.json ./
COPY vite.config.* ./
COPY index.html ./
COPY src ./src
COPY public ./public

RUN npm run build

# ---------- Stage 2: Nginx ----------
FROM nginx:1.25-alpine

# (не обязательно, но чисто)
RUN rm -f /etc/nginx/conf.d/*

# собранный фронт
COPY --from=build /app/dist /usr/share/nginx/html

# каталог для аватаров (том примонтируется сюда)
RUN mkdir -p /var/www/avatars
