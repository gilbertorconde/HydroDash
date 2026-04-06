# HydroDash — TanStack Start (Vite SSR). Production serves the built app with `vite preview`.
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
# Prefer `npm ci` locally when lockfile is in sync; `npm install` tolerates minor lock drift in CI/Docker.
RUN npm install

COPY . .
ARG VITE_OPENSPLINKER_BASE_URL
ENV VITE_OPENSPLINKER_BASE_URL=$VITE_OPENSPLINKER_BASE_URL
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
# vite preview + tanstackStart() still resolve router entry under src/ at config time (not only dist/).
COPY --from=builder /app/src ./src
COPY --from=builder /app/index.html ./
COPY --from=builder /app/public ./public
COPY vite.config.ts tsconfig.json tsconfig.node.json tsconfig.app.json ./

EXPOSE 4173
CMD ["npm", "run", "start"]

# Notification worker: same image, override command to
#   node dist/notifications-service.mjs
# (see docker-compose.yml service hydrodash-notify).
