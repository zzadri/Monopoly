FROM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /src/dist/front ./dist/front
EXPOSE 4000
CMD ["node", "dist/front/server/server.mjs"]
