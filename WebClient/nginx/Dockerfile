# ---------- Stage 1: build фронта ----------
FROM node:20-alpine AS client
WORKDIR /app

# env для Vite (подхватит только VITE_* во время билда)
ARG VITE_API_BASE
ARG VITE_HUB_URL
ENV VITE_API_BASE=${VITE_API_BASE}
ENV VITE_HUB_URL=${VITE_HUB_URL}

# сначала зависимости
COPY package*.json ./
RUN npm ci

# затем все нужные конфиги и исходники
COPY tsconfig*.json ./
COPY vite.config.* ./
COPY index.html ./
COPY public ./public
COPY src ./src

RUN npm run build

# ---------- Stage 2: nginx ----------
FROM nginx:1.25-alpine
RUN rm -f /etc/nginx/conf.d/*
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=client /app/dist /usr/share/nginx/html
RUN mkdir -p /var/www/avatars
