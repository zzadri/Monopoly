# ---------- étape 1 : build du client ----------
FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --no-audit --no-fund

COPY shared shared
COPY server server
COPY client client
RUN npm run build -w client

# ---------- étape 2 : image d'exécution ----------
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
# dépendances de production uniquement (tsx inclus : il exécute le serveur TS)
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY shared shared
COPY server server
COPY --from=build /app/client/dist client/dist

# données (SQLite + images) : répertoire accessible à l'utilisateur non-root
RUN mkdir -p server/data/uploads && chown -R node:node /app
USER node

ENV MONOPOLIE_PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.MONOPOLIE_PORT||3000)+'/api/auth/me').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
