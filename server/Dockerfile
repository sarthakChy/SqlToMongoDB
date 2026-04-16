FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm install

FROM node:20-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace sql-query-optimizer-server

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY frontend/package.json ./frontend/package.json
COPY --from=deps /app/node_modules ./node_modules
RUN npm prune --omit=dev
COPY --from=build /app/server/dist ./server/dist
COPY server/.env.example ./server/.env.example

EXPOSE 5000
CMD ["node", "server/dist/index.js"]
