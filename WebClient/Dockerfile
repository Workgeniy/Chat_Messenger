# ===== builder (Vite) =====
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
ARG VITE_API_BASE=/api
ARG VITE_HUB_URL=/chatHub
ENV VITE_API_BASE=$VITE_API_BASE
ENV VITE_HUB_URL=$VITE_HUB_URL
RUN npm run build

# ===== runtime (nginx) =====
FROM nginx:1.27-alpine


# статика внутрь образа
COPY --from=builder /app/dist /usr/share/nginx/html
