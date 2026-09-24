FROM node:22-bookworm-slim AS frontend-build
WORKDIR /build/main/depan
COPY main/depan/package.json main/depan/package-lock.json ./
RUN npm ci
COPY main/depan/ ./
RUN npm run build

FROM node:22-bookworm-slim AS backend-deps
WORKDIR /build/main/server
COPY main/server/package.json main/server/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3200
WORKDIR /app/main/server
COPY --from=backend-deps /build/main/server/node_modules ./node_modules
COPY main/server/ ./
COPY --from=frontend-build /build/main/depan/dist /app/main/depan/dist
USER node
EXPOSE 3200
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3200/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.js"]
