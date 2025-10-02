# syntax=docker/dockerfile:1.6
FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps || npm install --legacy-peer-deps --package-lock-only

FROM base AS dev
ENV NODE_ENV=development
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
VOLUME ["/app/session"]
CMD ["npm", "run", "dev"]

FROM base AS prod
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --legacy-peer-deps || npm install --omit=dev --legacy-peer-deps --package-lock-only
COPY . .
RUN npm run build
VOLUME ["/app/session"]
CMD ["npm", "run", "start"]
