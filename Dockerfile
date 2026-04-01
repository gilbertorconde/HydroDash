# HydroDash — TanStack Start (Vite SSR). Production serves the built app with `vite preview`.
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
# Prefer `npm ci` locally when lockfile is in sync; `npm install` tolerates minor lock drift in CI/Docker.
RUN npm install

COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY vite.config.ts tsconfig.json tsconfig.node.json tsconfig.app.json ./

EXPOSE 4173
CMD ["npm", "run", "start"]
