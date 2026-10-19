# Production images, from one build:
#   docker build --target web .       Next.js app (standalone server)
#   docker build --target migrate .   applies database migrations and seeds the demo data
#   docker build --target gateway .   voice gateway for Twilio phone calls
# docker-compose.yml runs all three with Postgres (pgvector).

FROM node:22-slim AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run build -w @voice-agent/web

FROM node:22-slim AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

FROM build AS migrate
CMD ["npm", "run", "db:setup"]

FROM build AS gateway
ENV NODE_ENV=production GATEWAY_PORT=8080
USER node
EXPOSE 8080
CMD ["npm", "run", "start", "-w", "@voice-agent/voice-gateway"]
