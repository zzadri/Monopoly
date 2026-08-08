# Service web : build du client puis nginx (fichiers statiques + reverse proxy).
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --no-audit --no-fund
COPY shared shared
COPY client client
RUN npm run build -w client

FROM nginx:1.27-alpine
# openssl : génération du certificat auto-signé du réseau local au démarrage
RUN apk add --no-cache openssl && \
  install -d -o nginx -g nginx /certs /var/cache/nginx /var/run /var/log/nginx

COPY --from=build /app/client/dist /usr/share/nginx/html
COPY docker/web/nginx.conf /etc/nginx/nginx.conf
COPY docker/web/app.conf /etc/nginx/app.conf
COPY docker/web/entrypoint.sh /docker-entrypoint-monopolie.sh
RUN chmod +x /docker-entrypoint-monopolie.sh

USER nginx

EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1

ENTRYPOINT ["/docker-entrypoint-monopolie.sh"]
