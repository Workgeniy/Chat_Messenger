# ===== builder (vite) =====
FROM node:20-alpine AS builder
WORKDIR /app

# передадим публичные переменные окружения (build-time)
ARG VITE_API_BASE
ARG VITE_HUB_URL
ENV VITE_API_BASE=${VITE_API_BASE}
ENV VITE_HUB_URL=${VITE_HUB_URL}

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ===== nginx =====
FROM nginx:1.27-alpine
WORKDIR /usr/share/nginx/html

# чистый html
RUN rm -rf /usr/share/nginx/html/*

# копируем собранный фронт
COPY --from=builder /app/dist ./

# nginx конфиг
COPY ./nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
