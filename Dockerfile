FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html ./
COPY public ./public
COPY src ./src
RUN npm run build

# Static files only: nginx without root, TLS and compression are done by Caddy in front.
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY deploy/static.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
