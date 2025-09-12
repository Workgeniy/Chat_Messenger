# ---------- Stage 1: build фронта ----------
FROM node:20-alpine AS client
WORKDIR /app
COPY package*.json ./
COPY vite.config.ts ./
COPY src ./src
COPY public ./public
RUN npm ci && npm run build

# ---------- Stage 2: nginx ----------
FROM nginx:1.25-alpine AS nginx
# чистим дефолтные конфиги
RUN rm -f /etc/nginx/conf.d/*

# КОНФИГ: путь внутри контекста ./WebClient
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# статика SPA
COPY --from=client /app/dist /usr/share/nginx/html

# директория для аватаров (монтируется volume'ом как :ro)
RUN mkdir -p /var/www/avatars
